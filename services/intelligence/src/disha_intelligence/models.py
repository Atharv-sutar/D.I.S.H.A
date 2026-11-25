"""Pydantic v2 data models aligned with contracts/schemas/*.schema.json."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

NodeType = Literal[
    "gate",
    "concourse",
    "concession",
    "restroom",
    "medical",
    "seating_section",
    "transit",
]
NodeTopologyStatus = Literal["open", "congested", "restricted", "closed"]

EventPhase = Literal[
    "pre_event_ingress",
    "in_play",
    "halftime_surge",
    "egress",
    "idle",
]
TelemetryTrend = Literal["rising", "stable", "falling"]
TelemetryStatus = Literal["optimal", "moderate", "high", "critical", "closed"]

IncidentCategory = Literal[
    "queue_surge",
    "crowd_bottleneck",
    "medical",
    "security",
    "facility_fault",
]
IncidentSeverity = Literal["low", "medium", "high", "critical"]
IncidentStatus = Literal["open", "acknowledged", "dispatched", "resolved"]
WaypointType = Literal[
    "origin",
    "checkpoint",
    "level_transition",
    "reroute_avoidance",
    "destination",
]


class HologramEnds(BaseModel):
    """Named cricket pitch ends."""

    north_end: str
    south_end: str


class TierRing(BaseModel):
    """3D bowl tier ring geometry."""

    id: str
    name: str
    level: int
    inner_radius_m: float
    outer_radius_m: float
    elevation_m: float
    height_m: float


class CanopyRing(BaseModel):
    """3D stadium roof canopy ring geometry."""

    inner_radius_m: float
    outer_radius_m: float
    elevation_m: float


class PerimeterRoad(BaseModel):
    """Perimeter road label placement around the stadium."""

    name: str
    label_x: float
    label_y: float
    angle_deg: float


class HologramSpec(BaseModel):
    """3D holographic stadium architecture metadata."""

    field_radius_m: float
    pitch_length_m: float
    pitch_orientation_deg: float = 0.0
    ends: HologramEnds | None = None
    tier_rings: list[TierRing] = Field(default_factory=list)
    canopy_ring: CanopyRing | None = None
    perimeter_roads: list[PerimeterRoad] = Field(default_factory=list)


class TopologyNode(BaseModel):
    """Navigable 3D stadium node conforming to stadium_topology.schema.json."""

    id: str = Field(..., pattern=r"^[a-z0-9_]+$")
    name: str
    type: NodeType
    level: int
    x: float
    y: float
    z: float = 0.0
    stand_code: str | None = None
    road_perimeter: str | None = None
    capacity: int = Field(..., ge=1)
    accessible: bool = True
    status: NodeTopologyStatus = "open"


class TopologyEdge(BaseModel):
    """Walkable edge connecting two stadium nodes."""

    id: str
    from_node: str
    to_node: str
    distance_m: float = Field(..., ge=0.0)
    width_m: float = Field(..., ge=0.5)
    accessible: bool = True
    bidirectional: bool = True


class StadiumTopology(BaseModel):
    """Canonical 3D stadium graph & hologram geometry model."""

    venue_id: str = Field(..., min_length=1)
    venue_name: str = Field(..., min_length=1)
    city: str | None = None
    capacity: int | None = Field(default=None, ge=1)
    coordinate_unit: str = "meters"
    levels: list[int]
    hologram_spec: HologramSpec | None = None
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]


class NodeTelemetry(BaseModel):
    """Real-time crowd & queue telemetry for a single node."""

    node_id: str
    occupancy: int = Field(..., ge=0)
    capacity: int = Field(..., ge=1)
    congestion_score: float = Field(..., ge=0.0, le=1.0)
    queue_length: int = Field(..., ge=0)
    estimated_wait_min: float = Field(..., ge=0.0)
    flow_rate_per_min: float = Field(..., ge=0.0)
    trend: TelemetryTrend | None = None
    status: TelemetryStatus
    pulse_intensity: float = Field(default=0.0, ge=0.0, le=1.0)
    active_incident_ids: list[str] = Field(default_factory=list)


class TelemetrySnapshot(BaseModel):
    """Real-time stadium-wide telemetry snapshot."""

    venue_id: str
    timestamp: datetime
    event_phase: EventPhase
    total_attendance_estimate: int | None = Field(default=None, ge=0)
    nodes: list[NodeTelemetry]


class Position3D(BaseModel):
    """3D coordinates for holographic incident beacon placement."""

    x: float
    y: float
    z: float
    level: int


class UserPosition3D(BaseModel):
    """Resolved 3D fan location inside the stadium hologram."""

    x: float
    y: float
    z: float
    level: int
    heading_deg: float = 0.0
    snapped_node_id: str


class TargetBeacon(BaseModel):
    """Game-style destination marker on the 3D stadium hologram."""

    node_id: str
    label: str
    x: float
    y: float
    z: float
    level: int


class RouteStep(BaseModel):
    """Turn-by-turn wayfinding instruction step."""

    order: int = Field(..., ge=1)
    node_id: str
    instruction: str
    distance_m: float = Field(..., ge=0.0)


class Waypoint3D(BaseModel):
    """Ordered 3D waypoint for glowing game-style trail rendering."""

    order: int = Field(..., ge=1)
    node_id: str
    x: float
    y: float
    z: float
    level: int
    waypoint_type: WaypointType
    instruction: str
    distance_m: float = Field(..., ge=0.0)


class TargetAlternative(BaseModel):
    """Alternative entrance or facility option with wait & congestion metrics."""

    node_id: str
    name: str
    estimated_wait_min: float = Field(..., ge=0.0)
    congestion_score: float = Field(..., ge=0.0, le=1.0)


class FanGuidanceResponse(BaseModel):
    """Optimal entrance/facility recommendation, 3D location, and waypoint trail."""

    venue_id: str
    generated_at: datetime
    origin_node_id: str
    destination_node_id: str
    recommended_target_id: str
    user_position: UserPosition3D | None = None
    target_beacon: TargetBeacon | None = None
    estimated_total_min: float = Field(..., ge=0.0)
    estimated_wait_min: float = Field(..., ge=0.0)
    estimated_walk_min: float = Field(..., ge=0.0)
    time_saved_min: float = Field(..., ge=0.0)
    accessible_only: bool = False
    route_node_ids: list[str]
    steps: list[RouteStep]
    waypoints_3d: list[Waypoint3D]
    alternatives: list[TargetAlternative]


class AlertIncident(BaseModel):
    """Operational alert or emerging incident with 3D hologram beacon position."""

    incident_id: str
    venue_id: str
    created_at: datetime
    updated_at: datetime | None = None
    category: IncidentCategory
    severity: IncidentSeverity
    status: IncidentStatus
    node_id: str
    position: Position3D | None = None
    title: str
    description: str
    recommended_action: str
    assigned_team: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
