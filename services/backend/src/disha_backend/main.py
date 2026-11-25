"""FastAPI application entrypoint for D.I.S.H.A. Core Backend & Streaming APIs."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from disha_backend.models import (
    AlertIncident,
    EventPhase,
    FanGuidanceResponse,
    IncidentCreateRequest,
    IncidentPatchRequest,
    LocateFanRequest,
    LocateFanResponse,
    NodeType,
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
        "ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001"
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app() -> FastAPI:
    """Create and configure the D.I.S.H.A. FastAPI backend application."""
    topology = load_stadium_topology()
    store = StadiumStateStore(topology)
    ws_manager = ConnectionManager()

    application = FastAPI(
        title="D.I.S.H.A. Core Backend & Streaming API",
        version="0.2.0",
        description=(
            "Real-time M. Chinnaswamy Stadium 3D hologram telemetry, "
            "waypoint routing gateway, and incident dispatch API."
        ),
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

    @application.get("/health", tags=["system"])
    async def health_check() -> dict[str, object]:
        """Liveness check with active venue metadata and WebSocket counts."""
        return {
            "service": "disha-backend",
            "status": "ok",
            "venue_id": store.topology.venue_id,
            "venue_name": store.topology.venue_name,
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
        payload = model_to_dict(updated)
        await ws_manager.broadcast("ops", "telemetry_update", payload)
        await ws_manager.broadcast("fan", "wait_times_update", payload)
        return updated

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
        return LocateFanResponse(
            venue_id=store.topology.venue_id,
            user_position=user_pos,
            nearest_node=nearest_node,
            distance_to_node_m=dist_m,
            local_telemetry=store.telemetry_map().get(nearest_node.id),
        )

    @application.get("/api/v1/routing/recommend", response_model=FanGuidanceResponse, tags=["routing"])
    async def get_routing_recommendation(
        origin: Optional[str] = Query(None, description="Starting stadium node ID"),
        user_x: Optional[float] = Query(None, description="Exact fan X coordinate in meters"),
        user_y: Optional[float] = Query(None, description="Exact fan Y coordinate in meters"),
        user_z: Optional[float] = Query(None, description="Exact fan Z elevation in meters"),
        user_level: Optional[int] = Query(None, description="Fan stadium level (0, 1, 2)"),
        heading_deg: float = Query(0.0, description="Fan compass heading in degrees"),
        target_type: Optional[NodeType] = Query("gate", description="Facility category"),
        target_id: Optional[str] = Query(None, description="Optional exact destination node ID"),
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
            return recommend_route(
                topology=store.topology,
                telemetry_map=store.telemetry_map(),
                incident_nodes=store.active_incident_nodes(),
                origin_node_id=resolved_origin,
                target_type=target_type,
                target_id=target_id,
                accessible_only=accessible,
                user_position=user_pos,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get("/api/v1/incidents", response_model=list[AlertIncident], tags=["incidents"])
    async def list_incidents(include_resolved: bool = True) -> list[AlertIncident]:
        """List active and historical stadium operational incidents."""
        return store.list_incidents(include_resolved=include_resolved)

    @application.post("/api/v1/incidents", response_model=AlertIncident, status_code=201, tags=["incidents"])
    async def create_incident(req: IncidentCreateRequest) -> AlertIncident:
        """Report or ingest a new incident and push 3D beacon alerts via WebSockets."""
        try:
            incident = store.create_incident(req)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        payload = model_to_dict(incident)
        await ws_manager.broadcast("ops", "incident_created", payload)
        await ws_manager.broadcast(
            "fan",
            "gate_advisory" if incident.category == "queue_surge" else "facility_alert",
            _incident_to_fan_advisory(incident),
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

    @application.post("/api/v1/demo/step", response_model=TelemetrySnapshot, tags=["demo"])
    async def step_demo_telemetry(phase: Optional[EventPhase] = None) -> TelemetrySnapshot:
        """Advance built-in M. Chinnaswamy demo telemetry one tick and broadcast via WS."""
        updated = store.step_demo_telemetry(phase=phase)
        payload = model_to_dict(updated)
        await ws_manager.broadcast("ops", "telemetry_update", payload)
        await ws_manager.broadcast("fan", "wait_times_update", payload)
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
