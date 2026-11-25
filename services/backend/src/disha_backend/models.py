"""Pydantic models for D.I.S.H.A. Core Backend aligned with /contracts/schemas/."""

from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


def model_to_dict(model: BaseModel) -> dict[str, Any]:
    """Serialize a Pydantic model cleanly across Pydantic v1 and v2."""
    if hasattr(model, "model_dump"):
        return model.model_dump()  # type: ignore[attr-defined]
    return model.dict()


NodeType = Literal[
    "gate",
    "concourse",
    "concession",
    "restroom",
    "medical",
    "seating_section",
    "transit",
]
NodeOperationalStatus = Literal["open", "congested", "restricted", "closed"]
EventPhase = Literal["pre_event_ingress", "in_play", "halftime_surge", "egress", "idle"]
CongestionStatus = Literal["optimal", "moderate", "high", "critical", "closed"]
TrendDirection = Literal["rising", "stable", "falling"]
IncidentCategory = Literal[
    "queue_surge", "crowd_bottleneck", "medical", "security", "facility_fault"
]
IncidentSeverity = Literal["low", "medium", "high", "critical"]
IncidentStatus = Literal["open", "acknowledged", "dispatched", "resolved"]
WaypointType = Literal[
    "origin", "checkpoint", "level_transition", "reroute_avoidance", "destination"
]


class TierRing(BaseModel):
    """Concentric bowl tier geometry for 3D hologram rendering."""

    id: str
    name: str
    level: int
    inner_radius_m: float
    outer_radius_m: float
    elevation_m: float
    height_m: float


class CanopyRing(BaseModel):
    """Roof/solar canopy ring geometry for 3D hologram rendering."""

    inner_radius_m: float
    outer_radius_m: float
    elevation_m: float


class PerimeterRoad(BaseModel):
    """Road label anchor around stadium perimeter."""

    name: str
    label_x: float
    label_y: float
    angle_deg: float = 0.0


class StadiumEnds(BaseModel):
    """Pitch end labels."""

    north_end: str
    south_end: str


class HologramSpec(BaseModel):
    """Architectural metadata for rendering the holographic 3D stadium."""

    field_radius_m: float = 68.0
    pitch_length_m: float = 20.12
    pitch_orientation_deg: float = 0.0
    ends: Optional[StadiumEnds] = None
    tier_rings: list[TierRing] = Field(default_factory=list)
    canopy_ring: Optional[CanopyRing] = None
    perimeter_roads: list[PerimeterRoad] = Field(default_factory=list)


class StadiumNode(BaseModel):
    """Single 3D navigable node inside the stadium graph."""

    id: str
    name: str
    type: NodeType
    level: int
    x: float
    y: float
    z: float = 0.0
    stand_code: Optional[str] = None
    road_perimeter: Optional[str] = None
    capacity: int = Field(..., ge=1)
    accessible: bool = True
    status: NodeOperationalStatus = "open"


class StadiumEdge(BaseModel):
    """Walkable connection between two stadium nodes."""

    id: str
    from_node: str
    to_node: str
    distance_m: float = Field(..., ge=0.0)
    width_m: float = Field(..., ge=0.5)
    accessible: bool = True
    bidirectional: bool = True


class StadiumTopology(BaseModel):
    """Complete stadium 3D spatial topology and hologram specification."""

    venue_id: str
    venue_name: str
    city: Optional[str] = None
    capacity: Optional[int] = None
    coordinate_unit: str = "meters"
    levels: list[int]
    hologram_spec: Optional[HologramSpec] = None
    nodes: list[StadiumNode]
    edges: list[StadiumEdge]


class NodeTelemetry(BaseModel):
    """Real-time crowd and wait-time telemetry for a single node."""

    node_id: str
    occupancy: int = Field(..., ge=0)
    capacity: int = Field(..., ge=1)
    congestion_score: float = Field(..., ge=0.0, le=1.0)
    queue_length: int = Field(..., ge=0)
    estimated_wait_min: float = Field(..., ge=0.0)
    flow_rate_per_min: float = Field(..., ge=0.0)
    trend: TrendDirection = "stable"
    status: CongestionStatus = "optimal"
    pulse_intensity: float = Field(0.0, ge=0.0, le=1.0)
    active_incident_ids: list[str] = Field(default_factory=list)


class TelemetrySnapshot(BaseModel):
    """Stadium-wide real-time telemetry tick."""

    venue_id: str
    timestamp: str
    event_phase: EventPhase
    total_attendance_estimate: Optional[int] = 0
    nodes: list[NodeTelemetry]


class Position3D(BaseModel):
    """3D coordinate inside the stadium hologram."""

    x: float
    y: float
    z: float
    level: int


class AlertIncident(BaseModel):
    """Operational alert or emerging stadium incident."""

    incident_id: str
    venue_id: str
    created_at: str
    updated_at: Optional[str] = None
    category: IncidentCategory
    severity: IncidentSeverity
    status: IncidentStatus = "open"
    node_id: str
    position: Optional[Position3D] = None
    title: str
    description: str
    recommended_action: str
    assigned_team: Optional[str] = None
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)


class IncidentCreateRequest(BaseModel):
    """Payload to report or ingest a new incident."""

    incident_id: Optional[str] = None
    venue_id: str = "chinnaswamy_bengaluru"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    category: IncidentCategory
    severity: IncidentSeverity
    status: IncidentStatus = "open"
    node_id: str
    position: Optional[Position3D] = None
    title: str
    description: str
    recommended_action: str
    assigned_team: Optional[str] = None
    confidence: Optional[float] = Field(0.9, ge=0.0, le=1.0)


class IncidentPatchRequest(BaseModel):
    """Payload to update an incident triage or dispatch status."""

    status: Optional[IncidentStatus] = None
    assigned_team: Optional[str] = None
    recommended_action: Optional[str] = None


class UserPosition3D(BaseModel):
    """Resolved 3D position of a fan within the stadium hologram."""

    x: float
    y: float
    z: float
    level: int
    heading_deg: float = 0.0
    snapped_node_id: str


class TargetBeacon(BaseModel):
    """Game-style destination beacon coordinates on the 3D hologram."""

    node_id: str
    label: str
    x: float
    y: float
    z: float
    level: int


class RouteStep(BaseModel):
    """Text instruction step for fan navigation."""

    order: int
    node_id: str
    instruction: str
    distance_m: float


class Waypoint3D(BaseModel):
    """3D waypoint marker rendered along a holographic guidance trail."""

    order: int
    node_id: str
    x: float
    y: float
    z: float
    level: int
    waypoint_type: WaypointType
    instruction: str
    distance_m: float


class AlternativeFacility(BaseModel):
    """Ranked alternative entrance or facility summary."""

    node_id: str
    name: str
    estimated_wait_min: float
    congestion_score: float


class FanGuidanceResponse(BaseModel):
    """Congestion-aware route, exact user 3D position, and game-style 3D waypoints."""

    venue_id: str
    generated_at: str
    origin_node_id: str
    destination_node_id: str
    recommended_target_id: str
    user_position: Optional[UserPosition3D] = None
    target_beacon: Optional[TargetBeacon] = None
    estimated_total_min: float
    estimated_wait_min: float
    estimated_walk_min: float
    time_saved_min: float
    accessible_only: bool = False
    route_node_ids: list[str]
    steps: list[RouteStep]
    waypoints_3d: list[Waypoint3D] = Field(default_factory=list)
    alternatives: list[AlternativeFacility] = Field(default_factory=list)


class LocateFanRequest(BaseModel):
    """Exact spatial location query from a fan's device/QR/BLE anchor."""

    x: float
    y: float
    z: Optional[float] = None
    level: Optional[int] = None
    heading_deg: float = 0.0


class LocateFanResponse(BaseModel):
    """Resolved 3D fan location and immediate local zone status."""

    venue_id: str
    user_position: UserPosition3D
    nearest_node: StadiumNode
    distance_to_node_m: float
    local_telemetry: Optional[NodeTelemetry] = None
