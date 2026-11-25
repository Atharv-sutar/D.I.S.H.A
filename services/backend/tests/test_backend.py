"""End-to-end backend tests for M. Chinnaswamy 3D topology, routing, state, and FastAPI."""

from __future__ import annotations

import asyncio
import json
import unittest

from disha_backend.main import create_app
from disha_backend.models import IncidentCreateRequest, IncidentPatchRequest, LocateFanRequest
from disha_backend.routing import recommend_route
from disha_backend.state import StadiumStateStore
from disha_backend.venue_loader import load_stadium_topology, snap_position_to_node


def _run_asgi_request(app, method: str, path: str, body: dict | None = None) -> tuple[int, dict | list]:
    """Invoke an ASGI FastAPI route directly in-process without external httpx."""
    raw_body = json.dumps(body).encode("utf-8") if body is not None else b""
    headers = [(b"content-type", b"application/json")] if body is not None else []
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method.upper(),
        "path": path.split("?")[0],
        "raw_path": path.split("?")[0].encode("utf-8"),
        "query_string": path.split("?", 1)[1].encode("utf-8") if "?" in path else b"",
        "headers": headers,
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
        "scheme": "http",
    }
    sent_messages: list[dict] = []
    received = False

    async def receive() -> dict:
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": raw_body, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message: dict) -> None:
        sent_messages.append(message)

    asyncio.run(app(scope, receive, send))
    status = next(m["status"] for m in sent_messages if m["type"] == "http.response.start")
    payload_bytes = b"".join(m.get("body", b"") for m in sent_messages if m["type"] == "http.response.body")
    return status, json.loads(payload_bytes.decode("utf-8"))


class BackendFoundationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.topology = load_stadium_topology()
        self.store = StadiumStateStore(self.topology)
        self.app = create_app()

    def test_chinnaswamy_3d_topology_loaded(self) -> None:
        self.assertEqual(self.topology.venue_id, "chinnaswamy_bengaluru")
        self.assertEqual(self.topology.venue_name, "M. Chinnaswamy Stadium")
        self.assertIsNotNone(self.topology.hologram_spec)
        self.assertEqual(
            self.topology.hologram_spec.ends.north_end,
            "Rahul Dravid End (BEML End)",
        )
        self.assertGreaterEqual(len(self.topology.nodes), 20)
        self.assertGreaterEqual(len(self.topology.edges), 25)

    def test_exact_3d_user_location_snapping(self) -> None:
        pos, node, dist = snap_position_to_node(
            self.topology, x=90.0, y=80.0, z=0.0, level=0, heading_deg=135.0
        )
        self.assertEqual(node.id, "gate_4_cubbon")
        self.assertEqual(pos.snapped_node_id, "gate_4_cubbon")
        self.assertEqual(pos.heading_deg, 135.0)
        self.assertLess(dist, 10.0)

    def test_congestion_aware_routing_avoids_surged_gate_and_emits_3d_waypoints(self) -> None:
        guidance = recommend_route(
            topology=self.topology,
            telemetry_map=self.store.telemetry_map(),
            incident_nodes=self.store.active_incident_nodes(),
            origin_node_id="transit_cubbon_park_metro",
            target_type="gate",
        )
        # Gate 1 has an active queue_surge incident & 0.86 congestion; Gate 18 is nearby and optimal
        self.assertNotEqual(guidance.recommended_target_id, "gate_1_cubbon")
        self.assertEqual(guidance.recommended_target_id, "gate_18_queens")
        self.assertGreater(len(guidance.waypoints_3d), 1)
        self.assertEqual(guidance.waypoints_3d[0].waypoint_type, "origin")
        self.assertEqual(guidance.waypoints_3d[-1].waypoint_type, "destination")
        self.assertIsNotNone(guidance.target_beacon)
        self.assertGreater(guidance.time_saved_min, 0.0)

    def test_accessible_route_excludes_stairs(self) -> None:
        # From North Food Hub to H Upper, direct edge is accessible=False; accessible route detours via East Restroom
        guidance = recommend_route(
            topology=self.topology,
            telemetry_map=self.store.telemetry_map(),
            incident_nodes=self.store.active_incident_nodes(),
            origin_node_id="concession_north_express",
            target_id="stand_h_upper",
            accessible_only=True,
        )
        self.assertTrue(guidance.accessible_only)
        self.assertIn("restroom_east", guidance.route_node_ids)
        self.assertEqual(guidance.waypoints_3d[0].level, 1)
        self.assertEqual(guidance.waypoints_3d[-1].level, 2)
        self.assertIn("Ascend to Level 2", guidance.waypoints_3d[-1].instruction)

    def test_incident_lifecycle_updates_hologram_pulse(self) -> None:
        created = self.store.create_incident(
            IncidentCreateRequest(
                category="medical",
                severity="critical",
                node_id="stand_f1_f2",
                title="Medical Assistance Needed at F1/F2",
                description="Spectator heat exhaustion reported in East Bowl.",
                recommended_action="Dispatch First-Aid Post East responders.",
            )
        )
        self.assertIsNotNone(created.position)
        telem_node = self.store.telemetry_map()["stand_f1_f2"]
        self.assertIn(created.incident_id, telem_node.active_incident_ids)
        self.assertGreaterEqual(telem_node.pulse_intensity, 0.65)

        resolved = self.store.update_incident(
            created.incident_id,
            IncidentPatchRequest(status="resolved", assigned_team="Medical East"),
        )
        self.assertEqual(resolved.status, "resolved")
        self.assertNotIn(
            created.incident_id,
            self.store.telemetry_map()["stand_f1_f2"].active_incident_ids,
        )

    def test_fastapi_asgi_endpoints_end_to_end(self) -> None:
        status, health = _run_asgi_request(self.app, "GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(health["venue_id"], "chinnaswamy_bengaluru")

        status, topo = _run_asgi_request(self.app, "GET", "/api/v1/venue/topology")
        self.assertEqual(status, 200)
        self.assertEqual(topo["venue_name"], "M. Chinnaswamy Stadium")

        status, located = _run_asgi_request(
            self.app,
            "POST",
            "/api/v1/fans/locate",
            body={"x": 0.0, "y": 88.0, "level": 1, "heading_deg": 45.0},
        )
        self.assertEqual(status, 200)
        self.assertEqual(located["nearest_node"]["id"], "concourse_north_e")

        status, routed = _run_asgi_request(
            self.app,
            "GET",
            "/api/v1/routing/recommend?user_x=0&user_y=88&user_level=1&target_type=concession",
        )
        self.assertEqual(status, 200)
        self.assertNotEqual(routed["recommended_target_id"], "concession_north_express")
        self.assertIn(
            routed["recommended_target_id"],
            ("concession_east_plaza", "concession_west_pavilion_lounge"),
        )
        self.assertGreaterEqual(len(routed["waypoints_3d"]), 2)

        status, stepped = _run_asgi_request(self.app, "POST", "/api/v1/demo/step")
        self.assertEqual(status, 200)
        self.assertEqual(stepped["venue_id"], "chinnaswamy_bengaluru")


if __name__ == "__main__":
    unittest.main()
