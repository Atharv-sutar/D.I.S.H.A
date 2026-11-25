"""FastAPI application entrypoint for D.I.S.H.A. Core Backend & Streaming APIs."""

from __future__ import annotations

import asyncio
import contextlib
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncIterator, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from disha_backend.intelligence_client import IntelligenceClient
from disha_backend.models import (
    ActiveFanSession,
    AlertIncident,
    BottleneckRequest,
    EventPhase,
    FanGuidanceResponse,
    ForecastResponse,
    HologramFrameResponse,
    IncidentCreateRequest,
    IncidentPatchRequest,
    LocateFanRequest,
    LocateFanResponse,
    NodeForecast,
    NodeType,
    OpsOverviewResponse,
    RouteMode,
    SimulationModeRequest,
    SimulationPhaseRequest,
    SimulationPresetRequest,
    SimulationStatusResponse,
    StadiumTopology,
    TelemetrySnapshot,
    model_to_dict,
)
from disha_backend.routing import recommend_route
from disha_backend.state import StadiumStateStore
from disha_backend.venue_loader import load_stadium_topology, snap_position_to_node
from disha_backend.ws_manager import ConnectionManager


def _incident_to_fan_advisory(incident: AlertIncident) -> dict[str, object]:
    """Convert an operational AlertIncident into a FanAdvisoryPayload envelope."""
    severity_map = {
        "low": "info",
        "medium": "warning",
        "high": "warning",
        "critical": "critical",
    }
    return {
        "advisory_id": f"adv_{incident.incident_id}",
        "title": incident.title,
        "message": incident.recommended_action or incident.description,
        "severity": severity_map.get(incident.severity, "warning"),
        "node_id": incident.node_id,
    }


def _allowed_origins() -> list[str]:
    raw = os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:3001,http://localhost:3002",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def _auto_stream_enabled() -> bool:
    return os.environ.get("DISHA_AUTO_STREAM", "true").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def _stream_interval_sec() -> float:
    try:
        return max(0.5, float(os.environ.get("DISHA_STREAM_INTERVAL_SEC", "3.0")))
    except ValueError:
        return 3.0


def create_app() -> FastAPI:
    """Create and configure the D.I.S.H.A. FastAPI backend application."""
    topology = load_stadium_topology()
    store = StadiumStateStore(topology)
    ws_manager = ConnectionManager()
    intel_client = IntelligenceClient()

    async def _broadcast_telemetry(snapshot: TelemetrySnapshot) -> None:
        payload = model_to_dict(snapshot)
        await ws_manager.broadcast("ops", "telemetry_update", payload)
        await ws_manager.broadcast("fan", "wait_times_update", payload)

    async def _background_stream_loop() -> None:
        interval = _stream_interval_sec()
        while True:
            await asyncio.sleep(interval)
            if store.is_external_intelligence_active():
                continue
            counts = ws_manager.counts()
            if counts.get("ops", 0) == 0 and counts.get("fan", 0) == 0:
                continue
            snap = store.step_demo_telemetry()
            await _broadcast_telemetry(snap)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        task: asyncio.Task[None] | None = None
        if _auto_stream_enabled():
            task = asyncio.create_task(_background_stream_loop())
        try:
            yield
        finally:
            if task is not None:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

    application = FastAPI(
        title="D.I.S.H.A. Core Backend & Streaming API",
        version="0.3.0",
        description=(
            "Real-time M. Chinnaswamy Stadium 3D hologram telemetry, "
            "waypoint routing gateway, live fan tracking, and incident dispatch API."
        ),
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.state.store = store
    application.state.ws_manager = ws_manager
    application.state.intel_client = intel_client

    @application.get("/health", tags=["system"])
    async def health_check() -> dict[str, object]:
        """Liveness check with venue metadata, streaming state, and client counts."""
        return {
            "service": "disha-backend",
            "status": "ok",
            "venue_id": store.topology.venue_id,
            "venue_name": store.topology.venue_name,
            "auto_stream": _auto_stream_enabled(),
            "external_intelligence_active": store.is_external_intelligence_active(),
            "tracked_fans": len(store.list_active_fans()),
            "active_incidents": len(store.list_incidents(include_resolved=False)),
            "ws_clients": ws_manager.counts(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    @application.get("/api/v1/venue/topology", response_model=StadiumTopology, tags=["venue"])
    async def get_venue_topology() -> StadiumTopology:
        """Return 3D M. Chinnaswamy Stadium graph and hologram geometry spec."""
        return store.topology

    @application.get("/api/v1/telemetry/latest", response_model=TelemetrySnapshot, tags=["telemetry"])
    async def get_latest_telemetry() -> TelemetrySnapshot:
        """Return latest crowd density, wait times, and hologram pulse scores."""
        return store.latest_telemetry

    @application.post("/api/v1/telemetry/ingest", response_model=TelemetrySnapshot, tags=["telemetry"])
    async def ingest_telemetry(snapshot: TelemetrySnapshot) -> TelemetrySnapshot:
        """Ingest a telemetry snapshot from services/intelligence and broadcast to WS streams."""
        updated = store.ingest_snapshot(snapshot)
        await _broadcast_telemetry(updated)
        return updated

    @application.get("/api/v1/ops/overview", response_model=OpsOverviewResponse, tags=["operations"])
    async def get_ops_overview() -> OpsOverviewResponse:
        """Return aggregated KPIs, top congested zones, and least-crowded gates for Ops UI."""
        return store.build_ops_overview()

    @application.get("/api/v1/hologram/frame", response_model=HologramFrameResponse, tags=["hologram"])
    async def get_hologram_frame() -> HologramFrameResponse:
        """Return unified 3D hologram overlay frame (nodes + beacons + active fans)."""
        return store.build_hologram_frame()

    @application.get("/api/v1/analytics/forecast", response_model=ForecastResponse, tags=["analytics"])
    async def get_congestion_forecast() -> ForecastResponse:
        """Return +5m/+10m congestion forecasts from intelligence :8001 or backend fallback."""
        remote = await intel_client.fetch_forecast()
        if remote and isinstance(remote.get("forecasts"), list):
            parsed: list[NodeForecast] = []
            for item in remote["forecasts"]:
                try:
                    score_5m = float(item.get("projected_5m", item.get("projected_5m_score", 0.0)))
                    score_10m = float(item.get("projected_10m", item.get("projected_10m_score", score_5m)))
                    cur = float(item.get("current_score", 0.0))
                    parsed.append(
                        NodeForecast(
                            node_id=str(item["node_id"]),
                            current_score=cur,
                            projected_5m_score=score_5m,
                            projected_10m_score=score_10m,
                            projected_5m_wait_min=float(item.get("projected_5m_wait_min", 0.0)),
                            trend=item.get("trend", "stable"),
                            risk_level=item.get("risk_level", "moderate" if score_5m >= 0.4 else "optimal"),
                        )
                    )
                except (KeyError, TypeError, ValueError):
                    continue
            if parsed:
                return ForecastResponse(
                    venue_id=store.topology.venue_id,
                    source="intelligence_service",
                    generated_at=datetime.now(timezone.utc).isoformat(),
                    forecasts=parsed,
                )
        return store.compute_fallback_forecasts()

    @application.get("/api/v1/fans/active", response_model=list[ActiveFanSession], tags=["fan"])
    async def list_active_fans() -> list[ActiveFanSession]:
        """List currently tracked fan 3D positions inside the stadium."""
        return store.list_active_fans()

    @application.post("/api/v1/fans/locate", response_model=LocateFanResponse, tags=["fan"])
    async def locate_fan(req: LocateFanRequest) -> LocateFanResponse:
        """Snap a fan's exact 3D stadium coordinates to the nearest navigable node."""
        user_pos, nearest_node, dist_m = snap_position_to_node(
            store.topology,
            x=req.x,
            y=req.y,
            z=req.z,
            level=req.level,
            heading_deg=req.heading_deg,
        )
        if req.fan_id:
            store.register_fan_location(req.fan_id, user_pos)
        return LocateFanResponse(
            venue_id=store.topology.venue_id,
            fan_id=req.fan_id,
            user_position=user_pos,
            nearest_node=nearest_node,
            distance_to_node_m=dist_m,
            local_telemetry=store.telemetry_map().get(nearest_node.id),
        )

    @application.get("/api/v1/routing/recommend", response_model=FanGuidanceResponse, tags=["routing"])
    async def get_routing_recommendation(
        origin: Optional[str] = Query(None, description="Starting stadium node ID"),
        fan_id: Optional[str] = Query(None, description="Optional fan session ID to track active waypoints"),
        user_x: Optional[float] = Query(None, description="Exact fan X coordinate in meters"),
        user_y: Optional[float] = Query(None, description="Exact fan Y coordinate in meters"),
        user_z: Optional[float] = Query(None, description="Exact fan Z elevation in meters"),
        user_level: Optional[int] = Query(None, description="Fan stadium level (0, 1, 2)"),
        heading_deg: float = Query(0.0, description="Fan compass heading in degrees"),
        target_type: Optional[NodeType] = Query("gate", description="Facility category"),
        target_id: Optional[str] = Query(None, description="Optional exact destination node ID"),
        route_mode: Optional[RouteMode] = Query(None, description="entry | exit | facility"),
        accessible: bool = Query(False, description="Require step-free accessible paths"),
    ) -> FanGuidanceResponse:
        """Compute congestion-aware route and game-style 3D waypoints."""
        resolved_origin = origin
        user_pos = None
        if user_x is not None and user_y is not None:
            user_pos, snapped_node, _ = snap_position_to_node(
                store.topology,
                x=user_x,
                y=user_y,
                z=user_z,
                level=user_level,
                heading_deg=heading_deg,
            )
            resolved_origin = resolved_origin or snapped_node.id

        if not resolved_origin:
            resolved_origin = "transit_cubbon_park_metro"

        try:
            guidance = recommend_route(
                topology=store.topology,
                telemetry_map=store.telemetry_map(),
                incident_nodes=store.active_incident_nodes(),
                origin_node_id=resolved_origin,
                target_type=target_type,
                target_id=target_id,
                accessible_only=accessible,
                user_position=user_pos,
                route_mode=route_mode,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if fan_id and guidance.user_position:
            store.record_fan_route(
                fan_id=fan_id,
                user_position=guidance.user_position,
                target_id=guidance.recommended_target_id,
                target_type=target_type,
                route_node_ids=guidance.route_node_ids,
            )
        return guidance

    @application.get("/api/v1/incidents", response_model=list[AlertIncident], tags=["incidents"])
    async def list_incidents(include_resolved: bool = True) -> list[AlertIncident]:
        """List active and historical stadium operational incidents."""
        return store.list_incidents(include_resolved=include_resolved)

    @application.post("/api/v1/incidents", response_model=AlertIncident, status_code=201, tags=["incidents"])
    async def create_incident(req: IncidentCreateRequest) -> AlertIncident:
        """Report or ingest a new incident and push 3D beacon & fan reroute alerts."""
        try:
            incident = store.create_incident(req)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        payload = model_to_dict(incident)
        await ws_manager.broadcast("ops", "incident_created", payload)
        advisory = _incident_to_fan_advisory(incident)
        impacted = store.impacted_fan_sessions(incident.node_id)
        if impacted:
            advisory["message"] = (
                f"{advisory['message']} ({len(impacted)} active fan route(s) affected — reroute recommended.)"
            )
        await ws_manager.broadcast(
            "fan",
            "gate_advisory" if incident.category == "queue_surge" else "facility_alert",
            advisory,
        )
        return incident

    @application.patch("/api/v1/incidents/{incident_id}", response_model=AlertIncident, tags=["incidents"])
    async def patch_incident(incident_id: str, patch: IncidentPatchRequest) -> AlertIncident:
        """Update incident triage/dispatch state and notify Ops Dashboard clients."""
        try:
            updated = store.update_incident(incident_id, patch)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        await ws_manager.broadcast("ops", "incident_updated", model_to_dict(updated))
        return updated

    @application.post("/api/v1/simulation/phase", response_model=TelemetrySnapshot, tags=["simulation"])
    async def set_simulation_phase(req: SimulationPhaseRequest) -> TelemetrySnapshot:
        """Update stadium match-day phase locally and forward to intelligence :8001 if online."""
        await intel_client.set_phase(req.phase)
        updated = store.set_demo_phase(req.phase)
        await _broadcast_telemetry(updated)
        return updated

    @application.post("/api/v1/simulation/bottleneck", response_model=TelemetrySnapshot, tags=["simulation"])
    async def control_bottleneck(req: BottleneckRequest) -> TelemetrySnapshot:
        """Inject or clear a crowd bottleneck locally and forward to intelligence :8001 if online."""
        await intel_client.set_bottleneck(
            node_id=req.node_id,
            severity=req.severity,
            duration_ticks=req.duration_ticks,
            clear=req.clear,
        )
        try:
            if req.clear:
                updated = store.clear_demo_bottleneck(req.node_id)
            else:
                updated = store.inject_demo_bottleneck(req.node_id, severity=req.severity)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        await _broadcast_telemetry(updated)
        return updated

    @application.get("/api/v1/simulation/status", response_model=SimulationStatusResponse, tags=["simulation"])
    async def get_simulation_status() -> SimulationStatusResponse:
        """Return active simulator phase, tick count, and bottleneck overrides."""
        return SimulationStatusResponse(
            venue_id=store.topology.venue_id,
            event_phase=store.latest_telemetry.event_phase,
            tick_count=store._tick_count,
            bottlenecked_nodes=dict(store._bottleneck_overrides),
            cleared_nodes=sorted(store._cleared_nodes),
            active_incident_count=len(store.list_incidents(include_resolved=False)),
            randomizer_enabled=store.randomizer_enabled,
            control_mode="randomized" if store.randomizer_enabled else "manual",
        )

    @application.post("/api/v1/simulation/mode", response_model=SimulationStatusResponse, tags=["simulation"])
    async def set_simulation_mode(req: SimulationModeRequest) -> SimulationStatusResponse:
        """Toggle randomized crowd waves vs. strict manual control mode."""
        if req.randomizer_enabled is not None:
            enabled = bool(req.randomizer_enabled)
        elif req.mode is not None:
            enabled = req.mode == "randomized"
        else:
            raise HTTPException(
                status_code=400,
                detail="Provide randomizer_enabled (bool) or mode ('randomized' | 'manual').",
            )
        store.set_randomizer(enabled)
        await intel_client.set_randomizer(enabled)
        return SimulationStatusResponse(
            venue_id=store.topology.venue_id,
            event_phase=store.latest_telemetry.event_phase,
            tick_count=store._tick_count,
            bottlenecked_nodes=dict(store._bottleneck_overrides),
            cleared_nodes=sorted(store._cleared_nodes),
            active_incident_count=len(store.list_incidents(include_resolved=False)),
            randomizer_enabled=store.randomizer_enabled,
            control_mode="randomized" if store.randomizer_enabled else "manual",
        )

    @application.post("/api/v1/simulation/reset", response_model=TelemetrySnapshot, tags=["simulation"])
    async def reset_simulation() -> TelemetrySnapshot:
        """Reset bottlenecks and restore baseline stadium telemetry & seed incidents."""
        updated, incidents = store.reset_demo_state()
        await _broadcast_telemetry(updated)
        for inc in incidents:
            await ws_manager.broadcast("ops", "incident_created", model_to_dict(inc))
        return updated

    @application.post("/api/v1/simulation/preset", response_model=TelemetrySnapshot, tags=["simulation"])
    async def apply_simulation_preset(req: SimulationPresetRequest) -> TelemetrySnapshot:
        """Apply a curated demonstration scenario and broadcast live updates."""
        try:
            updated, created_incidents = store.apply_demo_preset(req.preset)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await _broadcast_telemetry(updated)
        for inc in created_incidents:
            await ws_manager.broadcast("ops", "incident_created", model_to_dict(inc))
            await ws_manager.broadcast(
                "fan",
                "gate_advisory" if inc.category == "queue_surge" else "facility_alert",
                _incident_to_fan_advisory(inc),
            )
        return updated

    @application.post("/api/v1/demo/step", response_model=TelemetrySnapshot, tags=["demo"])
    async def step_demo_telemetry(phase: Optional[EventPhase] = None) -> TelemetrySnapshot:
        """Advance built-in M. Chinnaswamy demo telemetry one tick and broadcast via WS."""
        updated = store.step_demo_telemetry(phase=phase)
        await _broadcast_telemetry(updated)
        return updated

    @application.websocket("/ws/ops")
    async def ws_ops_endpoint(websocket: WebSocket) -> None:
        """Live WebSocket feed for the 3D Operations Command Center."""
        await ws_manager.connect("ops", websocket)
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            await websocket.send_json(
                {
                    "event": "telemetry_update",
                    "timestamp": now_iso,
                    "payload": model_to_dict(store.latest_telemetry),
                }
            )
            for inc in store.list_incidents():
                await websocket.send_json(
                    {
                        "event": "incident_created",
                        "timestamp": now_iso,
                        "payload": model_to_dict(inc),
                    }
                )
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            ws_manager.disconnect("ops", websocket)

    @application.websocket("/ws/fan")
    async def ws_fan_endpoint(websocket: WebSocket) -> None:
        """Live WebSocket feed for the 3D Fan Navigation Hologram App."""
        await ws_manager.connect("fan", websocket)
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            await websocket.send_json(
                {
                    "event": "wait_times_update",
                    "timestamp": now_iso,
                    "payload": model_to_dict(store.latest_telemetry),
                }
            )
            for inc in store.list_incidents(include_resolved=False):
                await websocket.send_json(
                    {
                        "event": (
                            "gate_advisory"
                            if inc.category == "queue_surge"
                            else "facility_alert"
                        ),
                        "timestamp": now_iso,
                        "payload": _incident_to_fan_advisory(inc),
                    }
                )
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            ws_manager.disconnect("fan", websocket)

    return application


app = create_app()


def main() -> None:
    """CLI entrypoint to run the D.I.S.H.A. Core Backend server."""
    host = os.environ.get("BACKEND_HOST", "0.0.0.0")
    port = int(os.environ.get("BACKEND_PORT", "8000"))
    uvicorn.run("disha_backend.main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
