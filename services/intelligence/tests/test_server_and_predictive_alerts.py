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
        venue_id="chinnaswamy_bengaluru",
        timestamp=datetime(2026, 11, 25, 19, 0, 0, tzinfo=UTC),
        event_phase="pre_event_ingress",
        nodes=[
            NodeTelemetry(
                node_id="gate_1_cubbon",
                occupancy=540,
                capacity=900,
                congestion_score=0.60,
                queue_length=15,
                estimated_wait_min=3.0,
                flow_rate_per_min=65.0,
                trend="rising",
                status="moderate",
                pulse_intensity=0.51,
            )
        ],
    )
    forecasts = [
        NodeForecast(
            node_id="gate_1_cubbon",
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
    assert incidents[0].position is not None
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
            assert health.json()["venue_id"] == "chinnaswamy_bengaluru"

            topo = client.get("/topology")
            assert topo.status_code == 200
            assert topo.json()["venue_id"] == "chinnaswamy_bengaluru"

            tel = client.get("/telemetry/latest")
            assert tel.status_code == 200
            assert len(tel.json()["nodes"]) == 26

            phase = client.post("/simulation/phase", json={"phase": "halftime_surge"})
            assert phase.status_code == 200
            assert phase.json()["phase"] == "halftime_surge"

            bn = client.post(
                "/simulation/bottleneck",
                json={"node_id": "gate_1_cubbon", "severity": 0.96, "duration_ticks": 5},
            )
            assert bn.status_code == 200

            step = client.post("/simulation/step")
            assert step.status_code == 200
            assert step.json()["snapshot"]["event_phase"] == "halftime_surge"

            forecast = client.get("/forecast")
            assert forecast.status_code == 200
            forecasts = forecast.json()["forecasts"]
            assert len(forecasts) == 26
            assert "current_score" in forecasts[0]
            assert "projected_5m_score" in forecasts[0]
            assert "projected_10m_score" in forecasts[0]
            assert "projected_5m_wait_min" in forecasts[0]
            assert "risk_level" in forecasts[0]

            route = client.get(
                "/routing/recommend",
                params={
                    "origin": "transit_cubbon_park_metro",
                    "target_type": "gate",
                    "route_mode": "entry",
                    "accessible": "true",
                },
            )
            assert route.status_code == 200
            data = route.json()
            assert data["accessible_only"] is True
            assert len(data["waypoints_3d"]) >= 2
            assert data["target_beacon"] is not None

            locate = client.post("/fans/locate", json={"x": -115, "y": 132, "level": 0})
            assert locate.status_code == 200
            assert locate.json()["snapped_node_id"] == "transit_cubbon_park_metro"

            coord_route = client.get(
                "/routing/recommend",
                params={"user_x": -115, "user_y": 132, "user_level": 0, "target_type": "gate"},
            )
            assert coord_route.status_code == 200
            assert coord_route.json()["origin_node_id"] == "transit_cubbon_park_metro"
    finally:
        server.shutdown()
        server.server_close()
