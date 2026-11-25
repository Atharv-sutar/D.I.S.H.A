import type {
  AlertIncident,
  IncidentStatus,
  NodeType,
  TelemetrySnapshot,
} from "./contracts";

export type OpsWsEventType =
  | "telemetry_update"
  | "incident_created"
  | "incident_updated";

export interface OpsTelemetryEnvelope {
  event: "telemetry_update";
  timestamp: string;
  payload: TelemetrySnapshot;
}

export interface OpsIncidentEnvelope {
  event: "incident_created" | "incident_updated";
  timestamp: string;
  payload: AlertIncident;
}

export type OpsWsEnvelope = OpsTelemetryEnvelope | OpsIncidentEnvelope;

export type FanWsEventType =
  | "wait_times_update"
  | "gate_advisory"
  | "facility_alert";

export interface FanAdvisoryPayload {
  advisory_id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  node_id?: string;
  recommended_node_id?: string;
  wait_times?: Record<string, number>;
}

export interface FanWaitTimesEnvelope {
  event: "wait_times_update";
  timestamp: string;
  payload: TelemetrySnapshot;
}

export interface FanAdvisoryEnvelope {
  event: "gate_advisory" | "facility_alert";
  timestamp: string;
  payload: FanAdvisoryPayload;
}

export type FanWsEnvelope = FanWaitTimesEnvelope | FanAdvisoryEnvelope;

export interface FanAdvisoryItem extends FanAdvisoryPayload {
  event: "gate_advisory" | "facility_alert";
  timestamp: string;
}

export interface IncidentPatchPayload {
  status: IncidentStatus;
  assigned_team?: string;
}

export type RoutingTargetType = Extract<
  NodeType,
  "gate" | "concession" | "restroom" | "seating_section"
>;

export interface RoutingQueryParams {
  origin: string;
  target_type: RoutingTargetType;
  target_id?: string;
  accessible?: boolean;
}

export type DataSourceMode = "auto" | "live" | "simulation";

export type ConnectionStatus = "connecting" | "live" | "simulation" | "offline";
