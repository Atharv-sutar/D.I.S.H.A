"""Tests for IncidentDetector and async SimulationPublisher."""

import asyncio
import json

import httpx
from disha_intelligence.detector import IncidentDetector
from disha_intelligence.publisher import PublisherConfig, SimulationPublisher
from disha_intelligence.simulator import CrowdSimulator


def test_incident_detector_flags_bottleneck_and_respects_cooldown() -> None:
    sim = CrowdSimulator(seed=42, initial_phase="halftime_surge")
    sim.inject_bottleneck("concession_north_express", severity=0.96)
    detector = IncidentDetector(topology=sim.topology, cooldown_seconds=30.0)

    all_incidents = []
    for _ in range(4):
        snap = sim.step()
        all_incidents.extend(detector.analyze(snap))

    food_incidents = [i for i in all_incidents if i.node_id == "concession_north_express"]
    assert len(food_incidents) == 1
    assert food_incidents[0].category in ("crowd_bottleneck", "queue_surge")
    assert food_incidents[0].severity in ("high", "critical")
    assert food_incidents[0].status == "open"
    assert food_incidents[0].confidence is not None
    assert food_incidents[0].position is not None
    assert food_incidents[0].position.level == 1


def test_publisher_posts_telemetry_and_incidents() -> None:
    posted: list[tuple[str, dict]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        posted.append((str(request.url), json.loads(request.content.decode())))
        return httpx.Response(200, json={"ok": True})

    sim = CrowdSimulator(seed=42, initial_phase="halftime_surge")
    sim.inject_bottleneck("gate_1_cubbon", severity=0.97)
    # Pre-warm 3 ticks so bottleneck congestion crosses threshold
    for _ in range(3):
        sim.step()

    config = PublisherConfig(
        ingest_url="http://testserver/api/v1/telemetry/ingest",
        incidents_url="http://testserver/api/v1/incidents",
        tick_interval_seconds=0.1,
        random_seed=42,
    )
    publisher = SimulationPublisher(config=config, simulator=sim)

    async def _run() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            snapshot, incidents = await publisher.publish_tick(client)
            assert snapshot.venue_id == "chinnaswamy_bengaluru"
            assert len(incidents) >= 1

    asyncio.run(_run())

    urls = [u for u, _ in posted]
    assert "http://testserver/api/v1/telemetry/ingest" in urls
    assert "http://testserver/api/v1/incidents" in urls
