import type {
  AlertIncident,
  FanGuidanceResponse,
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

export async function fetchRoutingRecommend(
  params: RoutingQueryParams,
  baseUrl = getApiBaseUrl()
): Promise<FanGuidanceResponse> {
  const query = new URLSearchParams({
    origin: params.origin,
    target_type: params.target_type,
    accessible: String(Boolean(params.accessible)),
  });
  if (params.target_id) {
    query.set("target_id", params.target_id);
  }
  return fetchJson<FanGuidanceResponse>(
    `${baseUrl}/api/v1/routing/recommend?${query.toString()}`
  );
}
