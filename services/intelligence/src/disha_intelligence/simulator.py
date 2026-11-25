"""Deterministic seeded stadium crowd & queue simulator."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import numpy as np

from disha_intelligence.engine import compute_congestion_score
from disha_intelligence.models import (
    EventPhase,
    NodeTelemetry,
    NodeType,
    StadiumTopology,
    TelemetrySnapshot,
    TelemetryStatus,
    TelemetryTrend,
    TopologyNode,
)
from disha_intelligence.topology import build_default_topology


@dataclass
class _BottleneckConfig:
    severity: float
    remaining_ticks: int | None


_PHASE_LOAD_PROFILES: dict[EventPhase, dict[NodeType, float]] = {
    "idle": {
        "transit": 0.05,
        "gate": 0.04,
        "concourse": 0.06,
        "concession": 0.05,
        "restroom": 0.04,
        "medical": 0.02,
        "seating_section": 0.03,
    },
    "pre_event_ingress": {
        "transit": 0.72,
        "gate": 0.80,
        "concourse": 0.58,
        "concession": 0.42,
        "restroom": 0.30,
        "medical": 0.12,
        "seating_section": 0.48,
    },
    "in_play": {
        "transit": 0.12,
        "gate": 0.15,
        "concourse": 0.22,
        "concession": 0.28,
        "restroom": 0.24,
        "medical": 0.15,
        "seating_section": 0.88,
    },
    "halftime_surge": {
        "transit": 0.14,
        "gate": 0.16,
        "concourse": 0.76,
        "concession": 0.90,
        "restroom": 0.85,
        "medical": 0.25,
        "seating_section": 0.52,
    },
    "egress": {
        "transit": 0.86,
        "gate": 0.78,
        "concourse": 0.82,
        "concession": 0.18,
        "restroom": 0.35,
        "medical": 0.20,
        "seating_section": 0.22,
    },
}

_BASE_SERVICE_RATE_PER_MIN: dict[NodeType, float] = {
    "transit": 180.0,
    "gate": 95.0,
    "concourse": 220.0,
    "concession": 28.0,
    "restroom": 40.0,
    "medical": 12.0,
    "seating_section": 260.0,
}


def _classify_status(congestion_score: float, node_status: str) -> TelemetryStatus:
    if node_status == "closed":
        return "closed"
    if congestion_score >= 0.85:
        return "critical"
    if congestion_score >= 0.65:
        return "high"
    if congestion_score >= 0.35:
        return "moderate"
    return "optimal"


def _classify_trend(prev_score: float | None, curr_score: float) -> TelemetryTrend:
    if prev_score is None:
        return "stable"
    delta = curr_score - prev_score
    if delta >= 0.03:
        return "rising"
    if delta <= -0.03:
        return "falling"
    return "stable"


class CrowdSimulator:
    """Generates deterministic TelemetrySnapshot ticks for a StadiumTopology."""

    def __init__(
        self,
        topology: StadiumTopology | None = None,
        seed: int = 42,
        initial_phase: EventPhase = "pre_event_ingress",
        start_time: datetime | None = None,
        tick_seconds: float = 2.0,
        randomizer_enabled: bool = True,
    ) -> None:
        self.topology = topology or build_default_topology()
        self.seed = seed
        self._rng = np.random.default_rng(np.random.PCG64(seed))
        self.event_phase: EventPhase = initial_phase
        self._tick_seconds = tick_seconds
        self.randomizer_enabled: bool = randomizer_enabled
        self._current_time = start_time or datetime(2026, 11, 25, 18, 0, 0, tzinfo=UTC)
        self._tick_count = 0
        self._prev_scores: dict[str, float] = {}
        self._prev_occupancy: dict[str, int] = {}
        self._bottlenecks: dict[str, _BottleneckConfig] = {}
        self._recently_cleared: set[str] = set()
        self._manual_relief: set[str] = set()
        self._phase_just_changed: bool = False
        self._node_map: dict[str, TopologyNode] = {n.id: n for n in self.topology.nodes}

    def set_randomizer(self, enabled: bool) -> None:
        """Enable or disable randomized crowd fluctuations (False = strict manual control)."""
        self.randomizer_enabled = bool(enabled)

    def set_phase(self, phase: EventPhase) -> None:
        """Switch the active stadium event phase."""
        if phase != self.event_phase:
            self.event_phase = phase
            self._manual_relief.clear()
            self._phase_just_changed = True

    def inject_bottleneck(
        self,
        node_id: str,
        severity: float = 0.92,
        duration_ticks: int | None = None,
    ) -> None:
        """Inject a localized bottleneck override on a node."""
        if node_id not in self._node_map:
            raise KeyError(f"Unknown node_id: {node_id}")
        clamped = float(min(1.0, max(0.0, severity)))
        self._recently_cleared.discard(node_id)
        self._manual_relief.discard(node_id)
        self._bottlenecks[node_id] = _BottleneckConfig(
            severity=clamped,
            remaining_ticks=duration_ticks,
        )

    def clear_bottleneck(self, node_id: str) -> None:
        """Remove an injected bottleneck and keep node relieved until phase change or re-injection."""
        if self._bottlenecks.pop(node_id, None) is not None:
            self._recently_cleared.add(node_id)
            self._manual_relief.add(node_id)

    def sync_bottlenecks(self, bottlenecks: dict[str, float]) -> None:
        """Synchronize active bottlenecks to match an external control map."""
        for node_id in list(self._bottlenecks):
            if node_id not in bottlenecks:
                del self._bottlenecks[node_id]
                self._recently_cleared.add(node_id)
                self._manual_relief.add(node_id)
        for node_id, severity in bottlenecks.items():
            if node_id in self._node_map:
                self.inject_bottleneck(node_id, severity=severity, duration_ticks=None)

    def step(self) -> TelemetrySnapshot:
        """Advance the simulation by one tick and emit a TelemetrySnapshot."""
        self._tick_count += 1
        if self._tick_count > 1:
            self._current_time = self._current_time + timedelta(seconds=self._tick_seconds)

        profile = _PHASE_LOAD_PROFILES[self.event_phase]
        node_telemetry: list[NodeTelemetry] = []
        total_attendance = 0

        for idx, node in enumerate(self.topology.nodes):
            base_ratio = profile[node.type]
            if self.randomizer_enabled:
                # Deterministic wave + small noise so different gates/stands diverge naturally
                wave = 0.08 * np.sin(self._tick_count * 0.25 + idx * 0.9)
                noise = float(self._rng.normal(0.0, 0.035))
            else:
                wave = 0.0
                noise = 0.0
            target_ratio = float(np.clip(base_ratio + wave + noise, 0.01, 1.05))

            if node.status == "closed":
                target_ratio = 0.0
            elif node.id in self._bottlenecks:
                bn = self._bottlenecks[node.id]
                target_ratio = bn.severity
            elif node.id in self._manual_relief:
                target_ratio = float(np.clip(0.22 + noise * 0.4, 0.12, 0.28))
            elif not self.randomizer_enabled and node.id in self._prev_occupancy and not self._phase_just_changed:
                # In strict manual mode, hold existing occupancy steady unless overridden
                target_ratio = self._prev_occupancy[node.id] / node.capacity

            target_occ = round(target_ratio * node.capacity)
            prev_occ = self._prev_occupancy.get(node.id, target_occ)
            # Apply injected/cleared bottlenecks and phase transitions immediately
            if (
                node.id in self._bottlenecks
                or node.id in self._recently_cleared
                or self._phase_just_changed
            ):
                alpha = 1.0
            else:
                alpha = 0.35
            occupancy = max(0, round((1.0 - alpha) * prev_occ + alpha * target_occ))
            if node.status == "closed":
                occupancy = 0

            congestion_score = compute_congestion_score(occupancy, node.capacity)
            base_rate = _BASE_SERVICE_RATE_PER_MIN[node.type]

            if node.status == "closed":
                flow_rate = 0.0
                queue_length = 0
                wait_min = 0.0
            elif node.id in self._bottlenecks:
                # Severe throughput drop under bottleneck
                flow_rate = round(max(2.0, base_rate * 0.15 * (1.1 - congestion_score)), 2)
                excess = max(0, occupancy - int(node.capacity * 0.55))
                queue_length = max(15, round(excess * 0.5 + 35 * congestion_score))
                wait_min = round(queue_length / max(flow_rate, 1.0), 2)
            else:
                # Throughput degrades above 0.7 congestion
                efficiency = 1.0 if congestion_score < 0.7 else max(0.25, 1.4 - congestion_score)
                flow_rate = round(max(1.0, base_rate * (0.25 + 0.75 * congestion_score) * efficiency), 2)
                if node.type in ("gate", "concession", "restroom", "medical"):
                    excess = max(0, occupancy - int(node.capacity * 0.45))
                    queue_length = round(excess * 0.35)
                    wait_min = round(queue_length / max(flow_rate, 1.0), 2)
                else:
                    queue_length = round(max(0, occupancy - int(node.capacity * 0.75)) * 0.2)
                    wait_min = round(queue_length / max(flow_rate, 1.0), 2)

            prev_score = self._prev_scores.get(node.id)
            trend = _classify_trend(prev_score, congestion_score)
            status = _classify_status(congestion_score, node.status)
            pulse_intensity = (
                0.0
                if node.status == "closed"
                else round(
                    min(
                        1.0,
                        congestion_score * 0.85 + (0.15 if node.id in self._bottlenecks else 0.0),
                    ),
                    4,
                )
            )

            self._prev_scores[node.id] = congestion_score
            self._prev_occupancy[node.id] = occupancy
            total_attendance += occupancy

            node_telemetry.append(
                NodeTelemetry(
                    node_id=node.id,
                    occupancy=occupancy,
                    capacity=node.capacity,
                    congestion_score=congestion_score,
                    queue_length=queue_length,
                    estimated_wait_min=wait_min,
                    flow_rate_per_min=flow_rate,
                    trend=trend,
                    status=status,
                    pulse_intensity=pulse_intensity,
                )
            )

        self._recently_cleared.clear()
        self._phase_just_changed = False
        self._tick_bottlenecks()

        return TelemetrySnapshot(
            venue_id=self.topology.venue_id,
            timestamp=self._current_time,
            event_phase=self.event_phase,
            total_attendance_estimate=total_attendance,
            nodes=node_telemetry,
        )

    def _tick_bottlenecks(self) -> None:
        expired: list[str] = []
        for node_id, bn in self._bottlenecks.items():
            if bn.remaining_ticks is not None:
                bn.remaining_ticks -= 1
                if bn.remaining_ticks <= 0:
                    expired.append(node_id)
        for node_id in expired:
            del self._bottlenecks[node_id]
