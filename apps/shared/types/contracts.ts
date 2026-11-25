/**
 * Canonical TypeScript interfaces matching D.I.S.H.A. JSON contracts in /contracts/schemas/.
 */

export type NodeType =
  | "gate"
  | "concourse"
  | "concession"
  | "restroom"
  | "medical"
  | "seating_section"
  | "transit";

export type NodeOperationalStatus = "open" | "congested" | "restricted" | "closed";
export type GateRole = "entry" | "exit" | "entry_exit";
export type RouteMode = "entry" | "exit" | "facility";

export interface TierRing {
  id: string;
  name: string;
  level: number;
  inner_radius_m: number;
  outer_radius_m: number;
  elevation_m: number;
  height_m: number;
}

export interface CanopyRing {
  inner_radius_m: number;
  outer_radius_m: number;
  elevation_m: number;
}

export interface PerimeterRoad {
  name: string;
  label_x: number;
  label_y: number;
  angle_deg: number;
}

export interface FloodlightTower {
  id: string;
  name: string;
  x: number;
  y: number;
  height_m: number;
}

export interface StandSector {
  id: string;
  name: string;
  level: number;
  start_deg: number;
  end_deg: number;
  inner_radius_m: number;
  outer_radius_m: number;
  elevation_m: number;
  height_m: number;
  linked_node_id: string;
}

export interface HologramSpec {
  field_radius_m: number;
  pitch_length_m: number;
  pitch_orientation_deg?: number;
  ends?: {
    north_end: string;
    south_end: string;
  };
  tier_rings?: TierRing[];
  canopy_ring?: CanopyRing;
  perimeter_roads?: PerimeterRoad[];
  floodlight_towers?: FloodlightTower[];
  stand_sectors?: StandSector[];
}

export interface StadiumNode {
  id: string;
  name: string;
  type: NodeType;
  level: number;
  x: number;
  y: number;
  z?: number;
  stand_code?: string;
  road_perimeter?: string;
  gate_role?: GateRole;
  capacity: number;
  accessible?: boolean;
  status?: NodeOperationalStatus;
}

export interface StadiumEdge {
  id: string;
  from_node: string;
  to_node: string;
  distance_m: number;
  width_m: number;
  accessible?: boolean;
  bidirectional?: boolean;
}

export interface StadiumTopology {
  venue_id: string;
  venue_name: string;
  city?: string;
  capacity?: number;
  coordinate_unit?: string;
  levels: number[];
  hologram_spec?: HologramSpec;
  nodes: StadiumNode[];
  edges: StadiumEdge[];
}

export type EventPhase =
  | "pre_event_ingress"
  | "in_play"
  | "halftime_surge"
  | "egress"
  | "idle";

export type CongestionLevel = "optimal" | "moderate" | "high" | "critical" | "closed";

export interface NodeTelemetry {
  node_id: string;
  occupancy: number;
  capacity: number;
  congestion_score: number;
  queue_length: number;
  estimated_wait_min: number;
  flow_rate_per_min: number;
  trend?: "rising" | "stable" | "falling";
  status: CongestionLevel;
  pulse_intensity?: number;
  active_incident_ids?: string[];
}

export interface TelemetrySnapshot {
  venue_id: string;
  timestamp: string;
  event_phase: EventPhase;
  total_attendance_estimate?: number;
  nodes: NodeTelemetry[];
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
  level: number;
}

export type IncidentCategory =
  | "queue_surge"
  | "crowd_bottleneck"
  | "medical"
  | "security"
  | "facility_fault";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "acknowledged" | "dispatched" | "resolved";

export interface AlertIncident {
  incident_id: string;
  venue_id: string;
  created_at: string;
  updated_at?: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  node_id: string;
  position?: Position3D;
  title: string;
  description: string;
  recommended_action: string;
  assigned_team?: string;
  confidence?: number;
}

export interface UserPosition3D {
  x: number;
  y: number;
  z: number;
  level: number;
  heading_deg?: number;
  snapped_node_id: string;
}

export interface TargetBeacon {
  node_id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  level: number;
}

export type WaypointType =
  | "origin"
  | "checkpoint"
  | "level_transition"
  | "reroute_avoidance"
  | "destination";

export interface Waypoint3D {
  order: number;
  node_id: string;
  x: number;
  y: number;
  z: number;
  level: number;
  waypoint_type: WaypointType;
  instruction: string;
  distance_m: number;
}

export interface RouteStep {
  order: number;
  node_id: string;
  instruction: string;
  distance_m: number;
}

export interface AlternativeFacility {
  node_id: string;
  name: string;
  estimated_wait_min: number;
  congestion_score: number;
}

export interface FanGuidanceResponse {
  venue_id: string;
  generated_at: string;
  origin_node_id: string;
  destination_node_id: string;
  recommended_target_id: string;
  user_position?: UserPosition3D;
  target_beacon?: TargetBeacon;
  estimated_total_min: number;
  estimated_wait_min: number;
  estimated_walk_min: number;
  time_saved_min: number;
  accessible_only?: boolean;
  route_node_ids: string[];
  steps: RouteStep[];
  waypoints_3d: Waypoint3D[];
  alternatives: AlternativeFacility[];
}

export interface LocateFanRequest {
  fan_id?: string;
  x: number;
  y: number;
  z?: number;
  level?: number;
  heading_deg?: number;
}

export interface LocateFanResponse {
  venue_id: string;
  fan_id?: string;
  user_position: UserPosition3D;
  nearest_node: StadiumNode;
  distance_to_node_m: number;
  local_telemetry?: NodeTelemetry;
}

export interface ActiveFanSession {
  fan_id: string;
  user_position: UserPosition3D;
  last_seen_at: string;
  active_target_id?: string;
  active_target_type?: NodeType;
  active_route_node_ids: string[];
}
