"""In-memory live stadium state store for telemetry, forecasts, fans, and incidents."""

from __future__ import annotations

import math
import time
from collections import deque
from datetime import datetime, timezone
from uuid import uuid4

from disha_backend.models import (
    ActiveFanSession,
    AlertIncident,
    CongestionStatus,
    EventPhase,
    ForecastResponse,
    HologramFrameResponse,
    HologramNodeState,
    IncidentCreateRequest,
    IncidentPatchRequest,
    NodeForecast,
    NodeTelemetry,
    NodeType,
    OpsOverviewResponse,
    Position3D,
    StadiumTopology,
    TelemetrySnapshot,
    UserPosition3D,
    ZoneSummary,
)


def _score_to_status(score: float) -> CongestionStatus:
    if score >= 0.85:
        return "critical"
    if score >= 0.65:
        return "high"
    if score >= 0.40:
        return "moderate"
    return "optimal"


class StadiumStateStore:
    """Holds current M. Chinnaswamy Stadium topology, telemetry, fans, and active incidents."""

    def __init__(self, topology: StadiumTopology) -> None:
        self.topology = topology
        self.node_map = {n.id: n for n in topology.nodes}
        self._tick_count = 0
        self._last_external_ingest_monotonic: float = 0.0
        self._bottleneck_overrides: dict[str, float] = {}
        self._history: deque[TelemetrySnapshot] = deque(maxlen=12)
        self.incidents: dict[str, AlertIncident] = {}
        self.fan_sessions: dict[str, ActiveFanSession] = {}
        self._fan_seen_monotonic: dict[str, float] = {}
        self._seed_initial_incidents()
        self.latest_telemetry: TelemetrySnapshot = self._build_seed_telemetry()
        self._history.append(self.latest_telemetry)

    def _seed_initial_incidents(self) -> None:
        now = datetime.now(timezone.utc).isoformat()
        seed_incidents = [
            AlertIncident(
                incident_id="inc_gate1_surge",
                venue_id=self.topology.venue_id,
                created_at=now,
                updated_at=now,
                category="queue_surge",
                severity="high",
                status="open",
                node_id="gate_1_cubbon",
                position=self._node_pos("gate_1_cubbon"),
                title="Pre-Match Entry Surge at Gate 1 (Cubbon Road)",
                description=(
                    "Queue velocity dropped below 35 fans/min ahead of toss; "
                    "wait time exceeding 14 minutes."
                ),
                recommended_action=(
                    "Open auxiliary security lane at Gate 1 and divert Cubbon Park "
                    "Metro arrivals toward Gate 4 or Gate 18."
                ),
                confidence=0.93,
            ),
            AlertIncident(
                incident_id="inc_food_north_bottleneck",
                venue_id=self.topology.venue_id,
                created_at=now,
                updated_at=now,
                category="crowd_bottleneck",
                severity="medium",
                status="acknowledged",
                node_id="concession_north_express",
                position=self._node_pos("concession_north_express"),
                title="Concourse Bottleneck near North Food Hub (E Stand)",
                description="Concession queue spilling into Rahul Dravid End walkway.",
                recommended_action=(
                    "Deploy 2 crowd marshals to clear concourse lane and route fans "
                    "to East Concourse Cafe."
                ),
                assigned_team="North Marshal Squad",
                confidence=0.87,
            ),
        ]
        for inc in seed_incidents:
            self.incidents[inc.incident_id] = inc

    def _node_pos(self, node_id: str) -> Position3D | None:
        node = self.node_map.get(node_id)
        if not node:
            return None
        return Position3D(x=node.x, y=node.y, z=node.z, level=node.level)

    def active_incident_nodes(self) -> set[str]:
        """Return node IDs with unresolved incidents."""
        return {
            inc.node_id
            for inc in self.incidents.values()
            if inc.status != "resolved"
        }

    def _incidents_by_node(self) -> dict[str, list[str]]:
        mapping: dict[str, list[str]] = {}
        for inc in self.incidents.values():
            if inc.status != "resolved":
                mapping.setdefault(inc.node_id, []).append(inc.incident_id)
        return mapping

    def _build_seed_telemetry(self) -> TelemetrySnapshot:
        base_ratios = {
            "transit_cubbon_park_metro": 0.62,
            "transit_mg_road_metro": 0.55,
            "gate_1_cubbon": 0.86,
            "gate_4_cubbon": 0.34,
            "gate_9_mg": 0.52,
            "gate_14_pavilion": 0.28,
            "gate_18_queens": 0.24,
            "concourse_north_e": 0.72,
            "concourse_east_f": 0.36,
            "concourse_south_a": 0.41,
            "concourse_west_pavilion": 0.29,
            "concession_north_express": 0.78,
            "concession_east_plaza": 0.27,
            "concession_south_corner": 0.39,
            "concession_west_pavilion_lounge": 0.22,
            "restroom_north": 0.58,
            "restroom_east": 0.25,
            "restroom_south": 0.31,
            "medical_east_post": 0.12,
            "medical_pavilion_post": 0.10,
            "stand_e_lower": 0.68,
            "stand_f1_f2": 0.45,
            "stand_h_upper": 0.51,
            "stand_a_c_bowl": 0.48,
            "stand_b_lower": 0.44,
            "stand_pavilion_p2": 0.33,
        }
        inc_map = self._incidents_by_node()
        nodes_telem: list[NodeTelemetry] = []
        total_occ = 0

        for node in self.topology.nodes:
            score = base_ratios.get(node.id, 0.30)
            occupancy = int(round(node.capacity * score))
            total_occ += occupancy
            queue_len = max(
                0,
                int(round(occupancy * (0.25 if node.type in ("gate", "concession") else 0.06))),
            )
            wait_min = round(queue_len / max(8.0, node.capacity * 0.03), 1)
            active_ids = inc_map.get(node.id, [])
            pulse = min(1.0, round(score + (0.25 if active_ids else 0.0), 2))
            nodes_telem.append(
                NodeTelemetry(
                    node_id=node.id,
                    occupancy=occupancy,
                    capacity=node.capacity,
                    congestion_score=round(score, 3),
                    queue_length=queue_len,
                    estimated_wait_min=wait_min,
                    flow_rate_per_min=round(max(8.0, 95.0 * (1.05 - score)), 1),
                    trend="rising" if score >= 0.7 else "stable",
                    status=_score_to_status(score),
                    pulse_intensity=pulse,
                    active_incident_ids=active_ids,
                )
            )

        return TelemetrySnapshot(
            venue_id=self.topology.venue_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            event_phase="pre_event_ingress",
            total_attendance_estimate=total_occ,
            nodes=nodes_telem,
        )

    def telemetry_map(self) -> dict[str, NodeTelemetry]:
        """Return node_id -> NodeTelemetry lookup."""
        return {t.node_id: t for t in self.latest_telemetry.nodes}

    def is_external_intelligence_active(self, window_sec: float = 12.0) -> bool:
        """Return True if /api/v1/telemetry/ingest received live ticks recently."""
        if self._last_external_ingest_monotonic <= 0.0:
            return False
        return (time.monotonic() - self._last_external_ingest_monotonic) <= window_sec

    def _apply_snapshot(self, snapshot: TelemetrySnapshot, mark_external: bool) -> TelemetrySnapshot:
        inc_map = self._incidents_by_node()
        enriched: list[NodeTelemetry] = []
        for item in snapshot.nodes:
            active_ids = inc_map.get(item.node_id, [])
            pulse = max(
                item.pulse_intensity,
                min(1.0, item.congestion_score + (0.25 if active_ids else 0.0)),
            )
            enriched.append(
                NodeTelemetry(
                    node_id=item.node_id,
                    occupancy=item.occupancy,
                    capacity=item.capacity,
                    congestion_score=item.congestion_score,
                    queue_length=item.queue_length,
                    estimated_wait_min=item.estimated_wait_min,
                    flow_rate_per_min=item.flow_rate_per_min,
                    trend=item.trend,
                    status=item.status,
                    pulse_intensity=round(pulse, 3),
                    active_incident_ids=active_ids,
                )
            )
        self.latest_telemetry = TelemetrySnapshot(
            venue_id=snapshot.venue_id,
            timestamp=snapshot.timestamp,
            event_phase=snapshot.event_phase,
            total_attendance_estimate=snapshot.total_attendance_estimate,
            nodes=enriched,
        )
        self._history.append(self.latest_telemetry)
        if mark_external:
            self._last_external_ingest_monotonic = time.monotonic()
        return self.latest_telemetry

    def ingest_snapshot(self, snapshot: TelemetrySnapshot) -> TelemetrySnapshot:
        """Store an externally produced telemetry snapshot and attach active incident beacons."""
        return self._apply_snapshot(snapshot, mark_external=True)

    def set_demo_phase(self, phase: EventPhase) -> TelemetrySnapshot:
        """Switch demo event phase immediately when running standalone."""
        return self.step_demo_telemetry(phase=phase)

    def inject_demo_bottleneck(self, node_id: str, severity: float = 0.92) -> TelemetrySnapshot:
        """Inject a localized demo congestion bottleneck on a node."""
        if node_id not in self.node_map:
            raise KeyError(f"Unknown stadium node_id: {node_id}")
        self._bottleneck_overrides[node_id] = min(0.99, max(0.5, severity))
        return self.step_demo_telemetry()

    def clear_demo_bottleneck(self, node_id: str) -> TelemetrySnapshot:
        """Clear a previously injected demo bottleneck."""
        if node_id not in self.node_map:
            raise KeyError(f"Unknown stadium node_id: {node_id}")
        self._bottleneck_overrides.pop(node_id, None)
        return self.step_demo_telemetry()

    def reset_demo_state(self) -> tuple[TelemetrySnapshot, list[AlertIncident]]:
        """Reset all bottlenecks and restore baseline M. Chinnaswamy state."""
        self._bottleneck_overrides.clear()
        self._tick_count = 0
        self.incidents.clear()
        self._seed_initial_incidents()
        self.latest_telemetry = self._build_seed_telemetry()
        self._history.clear()
        self._history.append(self.latest_telemetry)
        return self.latest_telemetry, self.list_incidents()

    def apply_demo_preset(
        self, preset: str
    ) -> tuple[TelemetrySnapshot, list[AlertIncident]]:
        """Apply a curated behind-the-scenes demonstration scenario."""
        self._bottleneck_overrides.clear()
        created_incidents: list[AlertIncident] = []

        if preset == "normal_flow":
            self.incidents = {
                k: v for k, v in self.incidents.items() if v.status == "resolved"
            }
            snap = self.step_demo_telemetry(phase="in_play")
            return snap, created_incidents

        if preset == "gate1_rush":
            self._bottleneck_overrides["gate_1_cubbon"] = 0.94
            self._bottleneck_overrides["concourse_north_e"] = 0.82
            snap = self.step_demo_telemetry(phase="pre_event_ingress")
            inc = self.create_incident(
                IncidentCreateRequest(
                    category="queue_surge",
                    severity="critical",
                    node_id="gate_1_cubbon",
                    title="Simulated Gate 1 (Cubbon Road) Matchday Crush",
                    description="Pre-match entry queue exceeded 94% capacity with 16+ min wait.",
                    recommended_action="Divert fans via 3D waypoints to Gate 18 (Queen's Rd) & Gate 4.",
                )
            )
            created_incidents.append(inc)
            return snap, created_incidents

        if preset == "halftime_concession_spike":
            self._bottleneck_overrides["concession_north_express"] = 0.93
            self._bottleneck_overrides["concession_south_corner"] = 0.86
            snap = self.step_demo_telemetry(phase="halftime_surge")
            inc = self.create_incident(
                IncidentCreateRequest(
                    category="crowd_bottleneck",
                    severity="high",
                    node_id="concession_north_express",
                    title="Simulated Halftime Food Court Surge (E Stand)",
                    description="Halftime rush spiking queues at North Food Hub & South Corner.",
                    recommended_action="Guide fans to East Concourse Cafe (F1/F2) & Pavilion Lounge.",
                )
            )
            created_incidents.append(inc)
            return snap, created_incidents

        if preset == "medical_emergency_east":
            self._bottleneck_overrides["concourse_east_f"] = 0.85
            snap = self.step_demo_telemetry(phase="in_play")
            inc = self.create_incident(
                IncidentCreateRequest(
                    category="medical",
                    severity="critical",
                    node_id="stand_f1_f2",
                    title="Simulated Medical Alert at F1/F2 East Bowl",
                    description="Emergency medical response requested in F1/F2 seating block.",
                    recommended_action="Dispatch First-Aid Post East team and keep East Concourse lane clear.",
                )
            )
            created_incidents.append(inc)
            return snap, created_incidents

        if preset == "post_match_egress":
            self._bottleneck_overrides["concourse_north_e"] = 0.88
            self._bottleneck_overrides["gate_9_mg"] = 0.84
            snap = self.step_demo_telemetry(phase="egress")
            inc = self.create_incident(
                IncidentCreateRequest(
                    category="crowd_bottleneck",
                    severity="high",
                    node_id="gate_9_mg",
                    title="Simulated Post-Match Exit Surge at Gate 9 (MG Road)",
                    description="Heavy egress toward MG Road Metro causing bottleneck at Gate 9.",
                    recommended_action="Route exiting fans to Gate 4 (Cubbon East) & Gate 18 (Queen's Rd).",
                )
            )
            created_incidents.append(inc)
            return snap, created_incidents

        raise ValueError(f"Unknown preset: {preset}")

    def step_demo_telemetry(self, phase: EventPhase | None = None) -> TelemetrySnapshot:
        """Advance deterministic demo telemetry one tick for standalone development."""
        self._tick_count += 1
        active_phase = phase or self.latest_telemetry.event_phase
        phase_bias = {
            "pre_event_ingress": 0.01,
            "in_play": -0.02,
            "halftime_surge": 0.03,
            "egress": 0.015,
            "idle": -0.04,
        }.get(active_phase, 0.0)

        inc_map = self._incidents_by_node()
        updated_nodes: list[NodeTelemetry] = []
        total_occ = 0

        for idx, prev in enumerate(self.latest_telemetry.nodes):
            node = self.node_map.get(prev.node_id)
            if prev.node_id in self._bottleneck_overrides:
                next_score = self._bottleneck_overrides[prev.node_id]
            else:
                wave = 0.035 * math.sin((self._tick_count + idx) * 0.7)
                type_bias = phase_bias if (node and node.type in ("gate", "concession", "concourse")) else 0.0
                next_score = min(
                    0.96,
                    max(0.08, round(prev.congestion_score + wave + type_bias, 3)),
                )

            occupancy = int(round(prev.capacity * next_score))
            total_occ += occupancy
            queue_factor = 0.25 if (node and node.type in ("gate", "concession")) else 0.06
            queue_len = max(0, int(round(occupancy * queue_factor)))
            wait_min = round(queue_len / max(8.0, prev.capacity * 0.03), 1)
            delta = next_score - prev.congestion_score
            trend = "rising" if delta > 0.01 else ("falling" if delta < -0.01 else "stable")
            active_ids = inc_map.get(prev.node_id, [])
            pulse = min(1.0, round(next_score + (0.25 if active_ids else 0.0), 3))
            updated_nodes.append(
                NodeTelemetry(
                    node_id=prev.node_id,
                    occupancy=occupancy,
                    capacity=prev.capacity,
                    congestion_score=next_score,
                    queue_length=queue_len,
                    estimated_wait_min=wait_min,
                    flow_rate_per_min=round(max(8.0, 95.0 * (1.05 - next_score)), 1),
                    trend=trend,
                    status=_score_to_status(next_score),
                    pulse_intensity=pulse,
                    active_incident_ids=active_ids,
                )
            )

        snap = TelemetrySnapshot(
            venue_id=self.topology.venue_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            event_phase=active_phase,
            total_attendance_estimate=total_occ,
            nodes=updated_nodes,
        )
        return self._apply_snapshot(snap, mark_external=False)

    def register_fan_location(
        self,
        fan_id: str,
        user_position: UserPosition3D,
    ) -> ActiveFanSession:
        """Record or refresh a fan's live 3D coordinates inside the stadium."""
        existing = self.fan_sessions.get(fan_id)
        session = ActiveFanSession(
            fan_id=fan_id,
            user_position=user_position,
            last_seen_at=datetime.now(timezone.utc).isoformat(),
            active_target_id=existing.active_target_id if existing else None,
            active_target_type=existing.active_target_type if existing else None,
            active_route_node_ids=existing.active_route_node_ids if existing else [],
        )
        self.fan_sessions[fan_id] = session
        self._fan_seen_monotonic[fan_id] = time.monotonic()
        return session

    def record_fan_route(
        self,
        fan_id: str,
        user_position: UserPosition3D,
        target_id: str,
        target_type: NodeType | None,
        route_node_ids: list[str],
    ) -> None:
        """Attach active route waypoints to a tracked fan session for dynamic rerouting."""
        self.fan_sessions[fan_id] = ActiveFanSession(
            fan_id=fan_id,
            user_position=user_position,
            last_seen_at=datetime.now(timezone.utc).isoformat(),
            active_target_id=target_id,
            active_target_type=target_type,
            active_route_node_ids=route_node_ids,
        )
        self._fan_seen_monotonic[fan_id] = time.monotonic()

    def list_active_fans(self, ttl_seconds: float = 900.0) -> list[ActiveFanSession]:
        """Return currently active tracked fan sessions within TTL."""
        now_m = time.monotonic()
        stale_ids = [
            fid
            for fid, seen_m in self._fan_seen_monotonic.items()
            if (now_m - seen_m) > ttl_seconds
        ]
        for fid in stale_ids:
            self._fan_seen_monotonic.pop(fid, None)
            self.fan_sessions.pop(fid, None)
        return list(self.fan_sessions.values())

    def impacted_fan_sessions(self, node_id: str) -> list[ActiveFanSession]:
        """Return active fans whose waypoint trail crosses an impacted node."""
        return [
            fan
            for fan in self.list_active_fans()
            if node_id in fan.active_route_node_ids
        ]

    def compute_fallback_forecasts(self) -> ForecastResponse:
        """Compute simple rolling-window +5m/+10m projections when port 8001 is offline."""
        snapshots = list(self._history)
        current_map = self.telemetry_map()
        prev_map = (
            {n.node_id: n for n in snapshots[0].nodes} if len(snapshots) > 1 else current_map
        )
        items: list[NodeForecast] = []
        for node in self.topology.nodes:
            cur = current_map.get(node.id)
            if not cur:
                continue
            prev = prev_map.get(node.id, cur)
            slope = (cur.congestion_score - prev.congestion_score) / max(1, len(snapshots) - 1)
            p5 = min(1.0, max(0.05, round(cur.congestion_score + slope * 2.5, 3)))
            p10 = min(1.0, max(0.05, round(cur.congestion_score + slope * 5.0, 3)))
            wait5 = round(cur.estimated_wait_min * (p5 / max(0.1, cur.congestion_score)), 1)
            items.append(
                NodeForecast(
                    node_id=node.id,
                    current_score=cur.congestion_score,
                    projected_5m_score=p5,
                    projected_10m_score=p10,
                    projected_5m_wait_min=wait5,
                    trend=cur.trend,
                    risk_level=_score_to_status(max(p5, p10)),
                )
            )
        return ForecastResponse(
            venue_id=self.topology.venue_id,
            source="backend_fallback",
            generated_at=datetime.now(timezone.utc).isoformat(),
            forecasts=items,
        )

    def build_ops_overview(self) -> OpsOverviewResponse:
        """Assemble executive Ops Dashboard summary."""
        tmap = self.telemetry_map()
        zones: list[ZoneSummary] = []
        gate_waits: list[float] = []
        gates: list[ZoneSummary] = []

        for node in self.topology.nodes:
            telem = tmap.get(node.id)
            if not telem:
                continue
            summary = ZoneSummary(
                node_id=node.id,
                name=node.name,
                type=node.type,
                level=node.level,
                congestion_score=telem.congestion_score,
                estimated_wait_min=telem.estimated_wait_min,
                status=telem.status,
            )
            zones.append(summary)
            if node.type == "gate":
                gate_waits.append(telem.estimated_wait_min)
                gates.append(summary)

        zones.sort(key=lambda z: z.congestion_score, reverse=True)
        gates.sort(key=lambda g: (g.congestion_score, g.estimated_wait_min))
        unresolved = self.list_incidents(include_resolved=False)
        critical_count = sum(1 for i in unresolved if i.severity in ("high", "critical"))

        return OpsOverviewResponse(
            venue_id=self.topology.venue_id,
            venue_name=self.topology.venue_name,
            timestamp=self.latest_telemetry.timestamp,
            event_phase=self.latest_telemetry.event_phase,
            total_attendance_estimate=self.latest_telemetry.total_attendance_estimate or 0,
            active_incident_count=len(unresolved),
            critical_incident_count=critical_count,
            tracked_fan_count=len(self.list_active_fans()),
            average_gate_wait_min=round(sum(gate_waits) / max(1, len(gate_waits)), 2),
            congested_zones=zones[:5],
            recommended_gates=gates[:3],
        )

    def build_hologram_frame(self) -> HologramFrameResponse:
        """Assemble unified 3D hologram overlay frame."""
        tmap = self.telemetry_map()
        holo_nodes: list[HologramNodeState] = []
        for node in self.topology.nodes:
            telem = tmap.get(node.id)
            holo_nodes.append(
                HologramNodeState(
                    id=node.id,
                    name=node.name,
                    type=node.type,
                    level=node.level,
                    x=node.x,
                    y=node.y,
                    z=node.z,
                    congestion_score=telem.congestion_score if telem else 0.0,
                    pulse_intensity=telem.pulse_intensity if telem else 0.0,
                    estimated_wait_min=telem.estimated_wait_min if telem else 0.0,
                    queue_length=telem.queue_length if telem else 0,
                    status=telem.status if telem else "optimal",
                    active_incident_ids=telem.active_incident_ids if telem else [],
                )
            )
        return HologramFrameResponse(
            venue_id=self.topology.venue_id,
            timestamp=self.latest_telemetry.timestamp,
            event_phase=self.latest_telemetry.event_phase,
            nodes=holo_nodes,
            active_incidents=self.list_incidents(include_resolved=False),
            active_fans=[fan.user_position for fan in self.list_active_fans()],
        )

    def list_incidents(self, include_resolved: bool = True) -> list[AlertIncident]:
        """Return incidents sorted newest first."""
        items = list(self.incidents.values())
        if not include_resolved:
            items = [i for i in items if i.status != "resolved"]
        items.sort(key=lambda i: i.created_at, reverse=True)
        return items

    def create_incident(self, req: IncidentCreateRequest) -> AlertIncident:
        """Create or update an incident and enrich with 3D hologram beacon position."""
        if req.node_id not in self.node_map:
            raise ValueError(f"Unknown stadium node_id: {req.node_id}")
        now = datetime.now(timezone.utc).isoformat()
        inc_id = req.incident_id or f"inc_{uuid4().hex[:8]}"
        incident = AlertIncident(
            incident_id=inc_id,
            venue_id=req.venue_id,
            created_at=req.created_at or now,
            updated_at=req.updated_at or now,
            category=req.category,
            severity=req.severity,
            status=req.status,
            node_id=req.node_id,
            position=req.position or self._node_pos(req.node_id),
            title=req.title,
            description=req.description,
            recommended_action=req.recommended_action,
            assigned_team=req.assigned_team,
            confidence=req.confidence,
        )
        self.incidents[inc_id] = incident
        self._apply_snapshot(self.latest_telemetry, mark_external=False)
        return incident

    def update_incident(self, incident_id: str, patch: IncidentPatchRequest) -> AlertIncident:
        """Update incident triage/dispatch state."""
        existing = self.incidents.get(incident_id)
        if not existing:
            raise KeyError(f"Incident not found: {incident_id}")

        updated = AlertIncident(
            incident_id=existing.incident_id,
            venue_id=existing.venue_id,
            created_at=existing.created_at,
            updated_at=datetime.now(timezone.utc).isoformat(),
            category=existing.category,
            severity=existing.severity,
            status=patch.status or existing.status,
            node_id=existing.node_id,
            position=existing.position,
            title=existing.title,
            description=existing.description,
            recommended_action=patch.recommended_action or existing.recommended_action,
            assigned_team=(
                patch.assigned_team if patch.assigned_team is not None else existing.assigned_team
            ),
            confidence=existing.confidence,
        )
        self.incidents[incident_id] = updated
        self._apply_snapshot(self.latest_telemetry, mark_external=False)
        return updated
