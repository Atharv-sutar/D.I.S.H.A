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

export interface StadiumNode {
  id: string;
  name: string;
  type: NodeType;
  level: number;
  x: number;
  y: number;
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
  capacity?: number;
  levels: number[];
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
}

export interface TelemetrySnapshot {
  venue_id: string;
  timestamp: string;
  event_phase: EventPhase;
  total_attendance_estimate?: number;
  nodes: NodeTelemetry[];
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
  title: string;
  description: string;
  recommended_action: string;
  assigned_team?: string;
  confidence?: number;
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
  estimated_total_min: number;
  estimated_wait_min: number;
  estimated_walk_min: number;
  time_saved_min: number;
  accessible_only?: boolean;
  route_node_ids: string[];
  steps: RouteStep[];
  alternatives: AlternativeFacility[];
}
