"""Anomaly & emerging operational incident detector."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from disha_intelligence.forecaster import NodeForecast
from disha_intelligence.models import (
    AlertIncident,
    IncidentCategory,
    IncidentSeverity,
    NodeTelemetry,
    StadiumTopology,
    TelemetrySnapshot,
    TopologyNode,
)
from disha_intelligence.topology import build_default_topology


class IncidentDetector:
    """Detects queue surges, crowd bottlenecks, and stalled throughput anomalies."""

    def __init__(
        self,
        topology: StadiumTopology | None = None,
        cooldown_seconds: float = 30.0,
    ) -> None:
        self.topology = topology or build_default_topology()
        self._node_map: dict[str, TopologyNode] = {n.id: n for n in self.topology.nodes}
        self._cooldown = timedelta(seconds=cooldown_seconds)
        self._last_alert_time: dict[tuple[str, IncidentCategory], datetime] = {}
        self._prev_nodes: dict[str, NodeTelemetry] = {}
        self._counter = 0

    def analyze(
        self,
        snapshot: TelemetrySnapshot,
        forecasts: list[NodeForecast] | None = None,
    ) -> list[AlertIncident]:
        """Inspect a TelemetrySnapshot (and optional forecasts) for AlertIncidents."""
        incidents: list[AlertIncident] = []
        now = snapshot.timestamp.astimezone(UTC)
        forecast_map = {f.node_id: f for f in forecasts} if forecasts else {}

        for node_tel in snapshot.nodes:
            if node_tel.status == "closed":
                self._prev_nodes[node_tel.node_id] = node_tel
                continue

            topo_node = self._node_map.get(node_tel.node_id)
            node_name = topo_node.name if topo_node else node_tel.node_id
            node_type = topo_node.type if topo_node else "concourse"
            prev = self._prev_nodes.get(node_tel.node_id)
            forecast = forecast_map.get(node_tel.node_id)

            detected = self._evaluate_node(node_tel, prev, node_name, node_type, forecast)
            for category, severity, confidence, title, description, action in detected:
                key = (node_tel.node_id, category)
                last_time = self._last_alert_time.get(key)
                if last_time is not None and (now - last_time) < self._cooldown:
                    continue

                self._counter += 1
                self._last_alert_time[key] = now
                incidents.append(
                    AlertIncident(
                        incident_id=f"inc_{snapshot.venue_id}_{self._counter:05d}",
                        venue_id=snapshot.venue_id,
                        created_at=now,
                        category=category,
                        severity=severity,
                        status="open",
                        node_id=node_tel.node_id,
                        title=title,
                        description=description,
                        recommended_action=action,
                        confidence=round(min(1.0, max(0.0, confidence)), 3),
                    )
                )

            self._prev_nodes[node_tel.node_id] = node_tel

        return incidents

    def _evaluate_node(
        self,
        curr: NodeTelemetry,
        prev: NodeTelemetry | None,
        node_name: str,
        node_type: str,
        forecast: NodeForecast | None = None,
    ) -> list[tuple[IncidentCategory, IncidentSeverity, float, str, str, str]]:
        findings: list[tuple[IncidentCategory, IncidentSeverity, float, str, str, str]] = []

        # 1. Stalled throughput / severe queue backup
        if curr.queue_length >= 40 and curr.flow_rate_per_min < 12.0 and curr.congestion_score >= 0.70:
            severity: IncidentSeverity = "critical" if curr.congestion_score >= 0.88 else "high"
            confidence = 0.75 + 0.22 * curr.congestion_score
            findings.append(
                (
                    "crowd_bottleneck",
                    severity,
                    confidence,
                    f"Stalled Throughput at {node_name}",
                    (
                        f"Queue reached {curr.queue_length} fans with flow rate dropping to "
                        f"{curr.flow_rate_per_min:.1f}/min (wait ~{curr.estimated_wait_min:.1f} min)."
                    ),
                    f"Dispatch crowd marshals to {node_name} and open bypass lanes.",
                )
            )
            return findings

        # 2. Queue surge (gates, concessions, restrooms)
        queue_jump = (curr.queue_length - prev.queue_length) if prev else 0
        if node_type in ("gate", "concession", "restroom") and (
            curr.estimated_wait_min >= 10.0 or (queue_jump >= 25 and curr.congestion_score >= 0.65)
        ):
            severity = "critical" if curr.estimated_wait_min >= 18.0 else "high"
            confidence = 0.70 + 0.25 * min(1.0, curr.estimated_wait_min / 20.0)
            findings.append(
                (
                    "queue_surge",
                    severity,
                    confidence,
                    f"Queue Surge at {node_name}",
                    (
                        f"Estimated wait time is {curr.estimated_wait_min:.1f} min "
                        f"({curr.queue_length} in queue, congestion {curr.congestion_score:.2f})."
                    ),
                    f"Reroute incoming fans to adjacent {node_type}s and add express staff.",
                )
            )

        # 3. General crowd bottleneck on concourses / transit / seating
        elif curr.congestion_score >= 0.82:
            severity = "critical" if curr.congestion_score >= 0.92 else "high"
            confidence = 0.72 + 0.25 * curr.congestion_score
            findings.append(
                (
                    "crowd_bottleneck",
                    severity,
                    confidence,
                    f"Crowd Bottleneck at {node_name}",
                    (
                        f"Occupancy at {curr.occupancy}/{curr.capacity} "
                        f"(congestion {curr.congestion_score:.2f}, trend {curr.trend or 'stable'})."
                    ),
                    f"Activate one-way flow control around {node_name} and update fan wayfinding.",
                )
            )

        # 4. Predictive early-warning from +5m/+10m forecast
        elif forecast is not None and forecast.will_breach_critical and curr.congestion_score >= 0.55:
            category: IncidentCategory = (
                "queue_surge" if node_type in ("gate", "concession", "restroom") else "crowd_bottleneck"
            )
            findings.append(
                (
                    category,
                    "medium",
                    0.68,
                    f"Predicted Surge at {node_name}",
                    (
                        f"Current congestion {curr.congestion_score:.2f} is projected to reach "
                        f"{forecast.predicted_5m_congestion:.2f} within 5 minutes."
                    ),
                    f"Pre-stage staff at {node_name} and enable proactive fan rerouting.",
                )
            )

        return findings
