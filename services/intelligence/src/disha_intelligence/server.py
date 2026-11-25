"""Lightweight stdlib HTTP microservice exposing the D.I.S.H.A. intelligence engine."""

from __future__ import annotations

import argparse
import json
import os
import threading
from dataclasses import asdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from disha_intelligence.detector import IncidentDetector
from disha_intelligence.forecaster import CongestionForecaster
from disha_intelligence.models import (
    AlertIncident,
    EventPhase,
    TelemetrySnapshot,
)
from disha_intelligence.routing import WayfindingEngine
from disha_intelligence.scenarios import SCENARIOS, build_scenario_simulator
from disha_intelligence.simulator import CrowdSimulator


class IntelligenceRuntime:
    """Thread-safe container holding simulator, forecaster, wayfinding, and detector."""

    def __init__(self, simulator: CrowdSimulator | None = None) -> None:
        self.lock = threading.Lock()
        self.simulator = simulator or CrowdSimulator()
        self.forecaster = CongestionForecaster(tick_seconds=self.simulator._tick_seconds)
        self.routing = WayfindingEngine(self.simulator.topology)
        self.detector = IncidentDetector(topology=self.simulator.topology)
        self.latest_snapshot: TelemetrySnapshot = self.simulator.step()
        self.forecaster.record(self.latest_snapshot)
        self.latest_incidents: list[AlertIncident] = []

    def step(self) -> tuple[TelemetrySnapshot, list[AlertIncident]]:
        """Advance simulation by one tick, record forecast, and detect incidents."""
        with self.lock:
            snapshot = self.simulator.step()
            self.forecaster.record(snapshot)
            forecasts = self.forecaster.forecast_all()
            incidents = self.detector.analyze(snapshot, forecasts=forecasts)
            inc_by_node: dict[str, list[str]] = {}
            for inc in incidents:
                inc_by_node.setdefault(inc.node_id, []).append(inc.incident_id)
            for node_tel in snapshot.nodes:
                if node_tel.node_id in inc_by_node:
                    node_tel.active_incident_ids = inc_by_node[node_tel.node_id]
                    node_tel.pulse_intensity = 1.0
            self.latest_snapshot = snapshot
            self.latest_incidents = incidents
            return snapshot, incidents

    def set_phase(self, phase: EventPhase) -> None:
        with self.lock:
            self.simulator.set_phase(phase)

    def inject_bottleneck(
        self, node_id: str, severity: float = 0.92, duration_ticks: int | None = None
    ) -> None:
        with self.lock:
            self.simulator.inject_bottleneck(
                node_id=node_id, severity=severity, duration_ticks=duration_ticks
            )

    def clear_bottleneck(self, node_id: str) -> None:
        with self.lock:
            self.simulator.clear_bottleneck(node_id)


def _make_handler(runtime: IntelligenceRuntime) -> type[BaseHTTPRequestHandler]:
    class IntelligenceHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            return

        def _send_json(self, status: int, payload: Any) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _read_json_body(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                return {}
            raw = self.rfile.read(length).decode("utf-8")
            return json.loads(raw) if raw else {}

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            path = parsed.path

            if path == "/health":
                with runtime.lock:
                    payload = {
                        "status": "ok",
                        "service": "disha-intelligence",
                        "venue_id": runtime.simulator.topology.venue_id,
                        "phase": runtime.simulator.event_phase,
                        "tick": runtime.simulator._tick_count,
                    }
                self._send_json(HTTPStatus.OK, payload)
                return

            if path == "/topology":
                self._send_json(HTTPStatus.OK, runtime.simulator.topology.model_dump(mode="json"))
                return

            if path == "/telemetry/latest":
                with runtime.lock:
                    snap = runtime.latest_snapshot.model_dump(mode="json")
                self._send_json(HTTPStatus.OK, snap)
                return

            if path == "/forecast":
                with runtime.lock:
                    forecasts = [asdict(f) for f in runtime.forecaster.forecast_all()]
                self._send_json(HTTPStatus.OK, {"forecasts": forecasts})
                return

            if path == "/routing/recommend":
                qs = parse_qs(parsed.query)
                origin = qs.get("origin", [None])[0]
                target_type = qs.get("target_type", [None])[0]
                target_id = qs.get("target_id", [None])[0]
                accessible_raw = qs.get("accessible", ["false"])[0].lower()
                accessible_only = accessible_raw in ("1", "true", "yes")

                if not origin:
                    self._send_json(HTTPStatus.BAD_REQUEST, {"error": "origin is required"})
                    return
                try:
                    with runtime.lock:
                        guidance = runtime.routing.recommend(
                            origin_node_id=origin,
                            snapshot=runtime.latest_snapshot,
                            target_type=target_type,  # type: ignore[arg-type]
                            target_id=target_id,
                            accessible_only=accessible_only,
                        )
                    self._send_json(HTTPStatus.OK, guidance.model_dump(mode="json"))
                except ValueError as exc:
                    self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
                return

            self._send_json(HTTPStatus.NOT_FOUND, {"error": f"Unknown path: {path}"})

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            path = parsed.path

            if path == "/simulation/step":
                snap, incidents = runtime.step()
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "snapshot": snap.model_dump(mode="json"),
                        "incidents": [i.model_dump(mode="json") for i in incidents],
                    },
                )
                return

            if path == "/simulation/phase":
                body = self._read_json_body()
                phase = body.get("phase")
                valid: tuple[EventPhase, ...] = (
                    "pre_event_ingress",
                    "in_play",
                    "halftime_surge",
                    "egress",
                    "idle",
                )
                if phase not in valid:
                    self._send_json(HTTPStatus.BAD_REQUEST, {"error": f"Invalid phase: {phase}"})
                    return
                runtime.set_phase(phase)
                self._send_json(HTTPStatus.OK, {"phase": phase})
                return

            if path == "/simulation/bottleneck":
                body = self._read_json_body()
                node_id = body.get("node_id")
                if not node_id:
                    self._send_json(HTTPStatus.BAD_REQUEST, {"error": "node_id is required"})
                    return
                if body.get("clear"):
                    runtime.clear_bottleneck(node_id)
                    self._send_json(HTTPStatus.OK, {"cleared": node_id})
                    return
                try:
                    runtime.inject_bottleneck(
                        node_id=node_id,
                        severity=float(body.get("severity", 0.92)),
                        duration_ticks=body.get("duration_ticks"),
                    )
                    self._send_json(HTTPStatus.OK, {"bottleneck": node_id})
                except KeyError as exc:
                    self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
                return

            self._send_json(HTTPStatus.NOT_FOUND, {"error": f"Unknown path: {path}"})

    return IntelligenceHandler


def create_server(
    host: str = "0.0.0.0",
    port: int = 8001,
    runtime: IntelligenceRuntime | None = None,
) -> tuple[ThreadingHTTPServer, IntelligenceRuntime]:
    """Create a configured ThreadingHTTPServer for the intelligence service."""
    rt = runtime or IntelligenceRuntime()
    server = ThreadingHTTPServer((host, port), _make_handler(rt))
    return server, rt


def main(argv: list[str] | None = None) -> None:
    """CLI entrypoint to start the intelligence HTTP server."""
    parser = argparse.ArgumentParser(description="D.I.S.H.A. Intelligence HTTP Server")
    parser.add_argument("--host", default=os.getenv("INTELLIGENCE_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.getenv("INTELLIGENCE_PORT", "8001")))
    parser.add_argument("--scenario", choices=sorted(SCENARIOS), default="matchday_ingress")
    args = parser.parse_args(argv)

    sim = build_scenario_simulator(
        args.scenario,
        seed=int(os.getenv("RANDOM_SEED", "42")),
        tick_seconds=float(os.getenv("TICK_INTERVAL_SECONDS", "2.0")),
    )
    server, _ = create_server(args.host, args.port, IntelligenceRuntime(sim))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
