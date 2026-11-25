"""In-memory live stadium state store for telemetry and incidents."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from uuid import uuid4

from disha_backend.models import (
    AlertIncident,
    CongestionStatus,
    EventPhase,
    IncidentCreateRequest,
    IncidentPatchRequest,
    NodeTelemetry,
    Position3D,
    StadiumTopology,
    TelemetrySnapshot,
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
    """Holds current M. Chinnaswamy Stadium topology, telemetry, and active incidents."""

    def __init__(self, topology: StadiumTopology) -> None:
        self.topology = topology
        self.node_map = {n.id: n for n in topology.nodes}
        self._tick_count = 0
        self.incidents: dict[str, AlertIncident] = {}
        self._seed_initial_incidents()
        self.latest_telemetry: TelemetrySnapshot = self._build_seed_telemetry()

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
            queue_len = max(0, int(round(occupancy * (0.25 if node.type in ("gate", "concession") else 0.06))))
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

    def ingest_snapshot(self, snapshot: TelemetrySnapshot) -> TelemetrySnapshot:
        """Store an externally produced telemetry snapshot and attach active incident beacons."""
        inc_map = self._incidents_by_node()
        enriched: list[NodeTelemetry] = []
        for item in snapshot.nodes:
            active_ids = inc_map.get(item.node_id, [])
            pulse = max(item.pulse_intensity, min(1.0, item.congestion_score + (0.25 if active_ids else 0.0)))
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
        return self.latest_telemetry

    def step_demo_telemetry(self, phase: EventPhase | None = None) -> TelemetrySnapshot:
        """Advance deterministic demo telemetry one tick for standalone development."""
        self._tick_count += 1
        inc_map = self._incidents_by_node()
        updated_nodes: list[NodeTelemetry] = []
        total_occ = 0

        for idx, prev in enumerate(self.latest_telemetry.nodes):
            wave = 0.04 * math.sin((self._tick_count + idx) * 0.7)
            next_score = min(0.98, max(0.08, round(prev.congestion_score + wave, 3)))
            occupancy = int(round(prev.capacity * next_score))
            total_occ += occupancy
            node = self.node_map.get(prev.node_id)
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

        self.latest_telemetry = TelemetrySnapshot(
            venue_id=self.topology.venue_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            event_phase=phase or self.latest_telemetry.event_phase,
            total_attendance_estimate=total_occ,
            nodes=updated_nodes,
        )
        return self.latest_telemetry

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
        self.ingest_snapshot(self.latest_telemetry)
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
        self.ingest_snapshot(self.latest_telemetry)
        return updated
