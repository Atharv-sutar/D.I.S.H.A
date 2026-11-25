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


class TopologyNode(BaseModel):
    """Navigable stadium node conforming to stadium_topology.schema.json."""

    id: str = Field(..., pattern=r"^[a-z0-9_]+$")
    name: str
    type: NodeType
    level: int
    x: float = Field(..., ge=0.0, le=1000.0)
    y: float = Field(..., ge=0.0, le=1000.0)
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
    """Canonical stadium graph model."""

    venue_id: str = Field(..., min_length=1)
    venue_name: str = Field(..., min_length=1)
    capacity: int | None = Field(default=None, ge=1)
    levels: list[int]
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


class TelemetrySnapshot(BaseModel):
    """Real-time stadium-wide telemetry snapshot."""

    venue_id: str
    timestamp: datetime
    event_phase: EventPhase
    total_attendance_estimate: int | None = Field(default=None, ge=0)
    nodes: list[NodeTelemetry]


class RouteStep(BaseModel):
    """Turn-by-turn wayfinding instruction step."""

    order: int = Field(..., ge=1)
    node_id: str
    instruction: str
    distance_m: float = Field(..., ge=0.0)


class TargetAlternative(BaseModel):
    """Alternative entrance or facility option with wait & congestion metrics."""

    node_id: str
    name: str
    estimated_wait_min: float = Field(..., ge=0.0)
    congestion_score: float = Field(..., ge=0.0, le=1.0)


class FanGuidanceResponse(BaseModel):
    """Optimal entrance/facility recommendation and congestion-aware route."""

    venue_id: str
    generated_at: datetime
    origin_node_id: str
    destination_node_id: str
    recommended_target_id: str
    estimated_total_min: float = Field(..., ge=0.0)
    estimated_wait_min: float = Field(..., ge=0.0)
    estimated_walk_min: float = Field(..., ge=0.0)
    time_saved_min: float = Field(..., ge=0.0)
    accessible_only: bool = False
    route_node_ids: list[str]
    steps: list[RouteStep]
    alternatives: list[TargetAlternative]


class AlertIncident(BaseModel):
    """Operational alert or emerging incident detected by analytics."""

    incident_id: str
    venue_id: str
    created_at: datetime
    updated_at: datetime | None = None
    category: IncidentCategory
    severity: IncidentSeverity
    status: IncidentStatus
    node_id: str
    title: str
    description: str
    recommended_action: str
    assigned_team: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
