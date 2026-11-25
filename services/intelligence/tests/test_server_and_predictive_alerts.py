"""Tests for predictive early-warning alerts and the intelligence HTTP server."""

from __future__ import annotations

import threading
from datetime import UTC, datetime

import httpx
from disha_intelligence.detector import IncidentDetector
from disha_intelligence.forecaster import NodeForecast
from disha_intelligence.models import NodeTelemetry, TelemetrySnapshot
from disha_intelligence.server import IntelligenceRuntime, create_server
from disha_intelligence.simulator import CrowdSimulator


def test_detector_emits_predictive_medium_alert_from_forecast() -> None:
    detector = IncidentDetector()
    snapshot = TelemetrySnapshot(
        venue_id="disha_arena_01",
        timestamp=datetime(2026, 11, 25, 19, 0, 0, tzinfo=UTC),
        event_phase="pre_event_ingress",
        nodes=[
            NodeTelemetry(
                node_id="gate_north_a",
                occupancy=540,
                capacity=900,
                congestion_score=0.60,
                queue_length=15,
                estimated_wait_min=3.0,
                flow_rate_per_min=65.0,
                trend="rising",
                status="moderate",
            )
        ],
    )
    forecasts = [
        NodeForecast(
            node_id="gate_north_a",
            current_congestion=0.60,
            predicted_5m_congestion=0.88,
            predicted_10m_congestion=0.95,
            predicted_5m_wait_min=11.0,
            predicted_10m_wait_min=16.0,
            will_breach_critical=True,
        )
    ]

    incidents = detector.analyze(snapshot, forecasts=forecasts)
    assert len(incidents) == 1
    assert incidents[0].severity == "medium"
    assert incidents[0].category == "queue_surge"
    assert "Predicted Surge" in incidents[0].title


def test_http_server_endpoints_end_to_end() -> None:
    runtime = IntelligenceRuntime(CrowdSimulator(seed=42, initial_phase="pre_event_ingress"))
    server, _ = create_server("127.0.0.1", 0, runtime)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        base_url = f"http://127.0.0.1:{port}"
        with httpx.Client(base_url=base_url, timeout=5.0) as client:
            health = client.get("/health")
            assert health.status_code == 200
            assert health.json()["status"] == "ok"

            topo = client.get("/topology")
            assert topo.status_code == 200
            assert topo.json()["venue_id"] == "disha_arena_01"

            tel = client.get("/telemetry/latest")
            assert tel.status_code == 200
            assert len(tel.json()["nodes"]) >= 20

            phase = client.post("/simulation/phase", json={"phase": "halftime_surge"})
            assert phase.status_code == 200
            assert phase.json()["phase"] == "halftime_surge"

            bn = client.post(
                "/simulation/bottleneck",
                json={"node_id": "gate_north_a", "severity": 0.96, "duration_ticks": 5},
            )
            assert bn.status_code == 200

            step = client.post("/simulation/step")
            assert step.status_code == 200
            assert step.json()["snapshot"]["event_phase"] == "halftime_surge"

            forecast = client.get("/forecast")
            assert forecast.status_code == 200
            assert len(forecast.json()["forecasts"]) >= 20

            route = client.get(
                "/routing/recommend",
                params={"origin": "transit_north_metro", "target_type": "gate", "accessible": "true"},
            )
            assert route.status_code == 200
            assert route.json()["accessible_only"] is True
            assert len(route.json()["route_node_ids"]) >= 2
    finally:
        server.shutdown()
        server.server_close()
