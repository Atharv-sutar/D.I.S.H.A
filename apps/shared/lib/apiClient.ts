import type {
  ActiveFanSession,
  AlertIncident,
  EventPhase,
  FanGuidanceResponse,
  IncidentCategory,
  IncidentSeverity,
  LocateFanRequest,
  LocateFanResponse,
  StadiumTopology,
  TelemetrySnapshot,
} from "../types/contracts";
import type {
  IncidentPatchPayload,
  RoutingQueryParams,
} from "../types/ws";

const DEFAULT_TIMEOUT_MS = 3500;

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
    "http://localhost:8000"
  );
}

export function getWsOpsUrl(): string {
  return (
    process.env.NEXT_PUBLIC_WS_OPS_URL ||
    `${getApiBaseUrl().replace(/^http/, "ws")}/ws/ops`
  );
}

export function getWsFanUrl(): string {
  return (
    process.env.NEXT_PUBLIC_WS_FAN_URL ||
    `${getApiBaseUrl().replace(/^http/, "ws")}/ws/fan`
  );
}

export async function fetchVenueTopology(
  baseUrl = getApiBaseUrl()
): Promise<StadiumTopology> {
  return fetchJson<StadiumTopology>(`${baseUrl}/api/v1/venue/topology`);
}

export async function fetchLatestTelemetry(
  baseUrl = getApiBaseUrl()
): Promise<TelemetrySnapshot> {
  return fetchJson<TelemetrySnapshot>(`${baseUrl}/api/v1/telemetry/latest`);
}

export async function fetchIncidents(
  baseUrl = getApiBaseUrl()
): Promise<AlertIncident[]> {
  return fetchJson<AlertIncident[]>(`${baseUrl}/api/v1/incidents`);
}

export async function fetchActiveFans(
  baseUrl = getApiBaseUrl()
): Promise<ActiveFanSession[]> {
  return fetchJson<ActiveFanSession[]>(`${baseUrl}/api/v1/fans/active`);
}

export async function locateFanPosition(
  payload: LocateFanRequest,
  baseUrl = getApiBaseUrl()
): Promise<LocateFanResponse> {
  return fetchJson<LocateFanResponse>(`${baseUrl}/api/v1/fans/locate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchIncident(
  incidentId: string,
  payload: IncidentPatchPayload,
  baseUrl = getApiBaseUrl()
): Promise<AlertIncident> {
  return fetchJson<AlertIncident>(
    `${baseUrl}/api/v1/incidents/${encodeURIComponent(incidentId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export async function setSimulationPhase(
  phase: EventPhase,
  baseUrl = getApiBaseUrl()
): Promise<TelemetrySnapshot> {
  return fetchJson<TelemetrySnapshot>(`${baseUrl}/api/v1/simulation/phase`, {
    method: "POST",
    body: JSON.stringify({ phase }),
  });
}

export async function controlBottleneck(
  payload: { node_id: string; severity?: number; clear?: boolean },
  baseUrl = getApiBaseUrl()
): Promise<TelemetrySnapshot> {
  return fetchJson<TelemetrySnapshot>(`${baseUrl}/api/v1/simulation/bottleneck`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function applySimulationPreset(
  preset:
    | "normal_flow"
    | "gate1_rush"
    | "halftime_concession_spike"
    | "medical_emergency_east"
    | "post_match_egress",
  baseUrl = getApiBaseUrl()
): Promise<TelemetrySnapshot> {
  return fetchJson<TelemetrySnapshot>(`${baseUrl}/api/v1/simulation/preset`, {
    method: "POST",
    body: JSON.stringify({ preset }),
  });
}

export async function resetSimulationState(
  baseUrl = getApiBaseUrl()
): Promise<TelemetrySnapshot> {
  return fetchJson<TelemetrySnapshot>(`${baseUrl}/api/v1/simulation/reset`, {
    method: "POST",
  });
}

export interface SimulationStatusResponse {
  venue_id: string;
  event_phase: EventPhase;
  tick_count: number;
  bottlenecked_nodes: Record<string, number>;
  active_incident_count: number;
  randomizer_enabled: boolean;
  control_mode: "randomized" | "manual";
}

export async function fetchSimulationStatus(
  baseUrl = getApiBaseUrl()
): Promise<SimulationStatusResponse> {
  return fetchJson<SimulationStatusResponse>(
    `${baseUrl}/api/v1/simulation/status`
  );
}

export async function setSimulationMode(
  randomizerEnabled: boolean,
  baseUrl = getApiBaseUrl()
): Promise<SimulationStatusResponse> {
  return fetchJson<SimulationStatusResponse>(
    `${baseUrl}/api/v1/simulation/mode`,
    {
      method: "POST",
      body: JSON.stringify({ randomizer_enabled: randomizerEnabled }),
    }
  );
}

export async function triggerDemoStep(
  baseUrl = getApiBaseUrl()
): Promise<TelemetrySnapshot> {
  return fetchJson<TelemetrySnapshot>(`${baseUrl}/api/v1/demo/step`, {
    method: "POST",
  });
}

export async function createIncident(
  payload: {
    category: IncidentCategory;
    severity: IncidentSeverity;
    node_id: string;
    title: string;
    description: string;
    recommended_action: string;
  },
  baseUrl = getApiBaseUrl()
): Promise<AlertIncident> {
  return fetchJson<AlertIncident>(`${baseUrl}/api/v1/incidents`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchRoutingRecommend(
  params: RoutingQueryParams,
  baseUrl = getApiBaseUrl()
): Promise<FanGuidanceResponse> {
  const query = new URLSearchParams({
    origin: params.origin,
    target_type: params.target_type,
    accessible: String(Boolean(params.accessible)),
  });
  if (params.fan_id) query.set("fan_id", params.fan_id);
  if (params.target_id) query.set("target_id", params.target_id);
  if (params.route_mode) query.set("route_mode", params.route_mode);
  if (params.user_x !== undefined) query.set("user_x", String(params.user_x));
  if (params.user_y !== undefined) query.set("user_y", String(params.user_y));
  if (params.user_z !== undefined) query.set("user_z", String(params.user_z));
  if (params.user_level !== undefined) {
    query.set("user_level", String(params.user_level));
  }
  if (params.heading_deg !== undefined) {
    query.set("heading_deg", String(params.heading_deg));
  }
  return fetchJson<FanGuidanceResponse>(
    `${baseUrl}/api/v1/routing/recommend?${query.toString()}`
  );
}
