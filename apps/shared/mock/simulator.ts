import type {
  AlertIncident,
  AlternativeFacility,
  FanGuidanceResponse,
  NodeTelemetry,
  RouteStep,
  StadiumNode,
  StadiumTopology,
  TelemetrySnapshot,
} from "../types/contracts";
import type { FanAdvisoryItem, RoutingQueryParams } from "../types/ws";
import { scoreToCongestionLevel } from "../lib/congestion";

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function tickTelemetrySnapshot(
  prev: TelemetrySnapshot,
  topology: StadiumTopology
): TelemetrySnapshot {
  const nodeMap = new Map<string, StadiumNode>(
    topology.nodes.map((n) => [n.id, n])
  );
  let totalOccupancy = 0;

  const updatedNodes: NodeTelemetry[] = prev.nodes.map((node, index) => {
    const meta = nodeMap.get(node.node_id);
    const wave = Math.sin(Date.now() / 5500 + index * 0.9);
    const jitter = (Math.random() - 0.5) * 0.055;
    const nextScore = clamp(
      Number((node.congestion_score + wave * 0.025 + jitter).toFixed(2)),
      0.08,
      0.96
    );
    const delta = nextScore - node.congestion_score;
    const trend: NodeTelemetry["trend"] =
      delta > 0.015 ? "rising" : delta < -0.015 ? "falling" : "stable";

    const nextOccupancy = clamp(
      Math.round(node.capacity * (0.2 + nextScore * 0.75)),
      5,
      node.capacity
    );
    const isQueueNode =
      meta?.type === "gate" ||
      meta?.type === "concession" ||
      meta?.type === "restroom";

    const nextQueue = isQueueNode
      ? Math.max(2, Math.round(nextScore * nextScore * 190))
      : Math.max(0, Math.round(nextScore * 45));

    const nextWait = isQueueNode
      ? Number((0.8 + nextScore * nextScore * 18.5).toFixed(1))
      : Number((0.6 + nextScore * 4.5).toFixed(1));

    const nextFlow = Math.max(
      12,
      Math.round((meta?.capacity ?? 500) * 0.08 * (1.25 - nextScore * 0.7))
    );

    if (meta?.type === "seating_section" || meta?.type === "concourse") {
      totalOccupancy += nextOccupancy;
    }

    return {
      ...node,
      occupancy: nextOccupancy,
      congestion_score: nextScore,
      queue_length: nextQueue,
      estimated_wait_min: nextWait,
      flow_rate_per_min: nextFlow,
      trend,
      status:
        meta?.status === "closed"
          ? "closed"
          : scoreToCongestionLevel(nextScore),
    };
  });

  return {
    ...prev,
    timestamp: new Date().toISOString(),
    total_attendance_estimate: Math.max(
      prev.total_attendance_estimate ?? 45000,
      totalOccupancy + 18500
    ),
    nodes: updatedNodes,
  };
}

export function maybeGenerateMockIncident(
  telemetry: TelemetrySnapshot,
  topology: StadiumTopology,
  existing: AlertIncident[]
): AlertIncident | null {
  const activeNodeIds = new Set(
    existing
      .filter((inc) => inc.status !== "resolved")
      .map((inc) => inc.node_id)
  );
  const hotspot = telemetry.nodes.find(
    (n) => n.congestion_score >= 0.84 && !activeNodeIds.has(n.node_id)
  );
  if (!hotspot) return null;

  const nodeMeta = topology.nodes.find((n) => n.id === hotspot.node_id);
  const label = nodeMeta?.name ?? hotspot.node_id;

  return {
    incident_id: `inc_${Date.now().toString().slice(-5)}`,
    venue_id: telemetry.venue_id,
    created_at: new Date().toISOString(),
    category: nodeMeta?.type === "gate" ? "queue_surge" : "crowd_bottleneck",
    severity: hotspot.congestion_score >= 0.9 ? "critical" : "high",
    status: "open",
    node_id: hotspot.node_id,
    title: `Live Surge Detected at ${label}`,
    description: `Congestion index reached ${Math.round(
      hotspot.congestion_score * 100
    )}% with ~${hotspot.estimated_wait_min} min estimated wait.`,
    recommended_action: `Reroute incoming fans away from ${label} and open overflow lane.`,
    confidence: 0.91,
  };
}

export function generateMockFanAdvisory(
  telemetry: TelemetrySnapshot,
  topology: StadiumTopology
): FanAdvisoryItem {
  const nodeMeta = new Map(topology.nodes.map((n) => [n.id, n]));
  const gates = telemetry.nodes
    .filter((n) => nodeMeta.get(n.node_id)?.type === "gate")
    .sort((a, b) => a.estimated_wait_min - b.estimated_wait_min);

  const bestGate = gates[0];
  const busiestGate = gates[gates.length - 1];
  const bestName = nodeMeta.get(bestGate?.node_id ?? "")?.name ?? "East Gate B";
  const busyName =
    nodeMeta.get(busiestGate?.node_id ?? "")?.name ?? "North Gate A";

  return {
    advisory_id: `adv_${Date.now().toString().slice(-5)}`,
    event: busiestGate && busiestGate.congestion_score > 0.78 ? "gate_advisory" : "facility_alert",
    timestamp: new Date().toISOString(),
    title: `Fastest Entry Now: ${bestName} (${bestGate?.estimated_wait_min ?? 2} min)`,
    message: `${busyName} is currently at ${
      busiestGate?.estimated_wait_min ?? 12
    } min wait. Switch to ${bestName} for smoother entry.`,
    severity:
      busiestGate && busiestGate.congestion_score > 0.8 ? "warning" : "info",
    node_id: busiestGate?.node_id,
    recommended_node_id: bestGate?.node_id,
  };
}

interface GraphNeighbor {
  to: string;
  distance_m: number;
  accessible: boolean;
}

export function computeMockFanGuidance(
  topology: StadiumTopology,
  telemetry: TelemetrySnapshot,
  params: RoutingQueryParams
): FanGuidanceResponse {
  const nodeMap = new Map(topology.nodes.map((n) => [n.id, n]));
  const telemetryMap = new Map(telemetry.nodes.map((n) => [n.node_id, n]));
  const accessibleOnly = Boolean(params.accessible);

  const adjacency = new Map<string, GraphNeighbor[]>();
  for (const node of topology.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of topology.edges) {
    const isAcc = edge.accessible !== false;
    if (accessibleOnly && !isAcc) continue;
    adjacency.get(edge.from_node)?.push({
      to: edge.to_node,
      distance_m: edge.distance_m,
      accessible: isAcc,
    });
    if (edge.bidirectional !== false) {
      adjacency.get(edge.to_node)?.push({
        to: edge.from_node,
        distance_m: edge.distance_m,
        accessible: isAcc,
      });
    }
  }

  // Dijkstra from origin with congestion-weighted edge cost
  const cost = new Map<string, number>();
  const walkDist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const visited = new Set<string>();

  for (const node of topology.nodes) {
    cost.set(node.id, Infinity);
    walkDist.set(node.id, Infinity);
    prev.set(node.id, null);
  }
  cost.set(params.origin, 0);
  walkDist.set(params.origin, 0);

  while (visited.size < topology.nodes.length) {
    let current: string | null = null;
    let bestCost = Infinity;
    for (const [nodeId, c] of cost.entries()) {
      if (!visited.has(nodeId) && c < bestCost) {
        bestCost = c;
        current = nodeId;
      }
    }
    if (!current || bestCost === Infinity) break;
    visited.add(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.has(neighbor.to)) continue;
      const targetMeta = nodeMap.get(neighbor.to);
      if (accessibleOnly && targetMeta?.accessible === false) continue;
      if (targetMeta?.status === "closed") continue;

      const tScore = telemetryMap.get(neighbor.to)?.congestion_score ?? 0.3;
      const effectiveDist = neighbor.distance_m * (1 + tScore * 0.9);
      const nextCost = bestCost + effectiveDist;

      if (nextCost < (cost.get(neighbor.to) ?? Infinity)) {
        cost.set(neighbor.to, nextCost);
        walkDist.set(
          neighbor.to,
          (walkDist.get(current) ?? 0) + neighbor.distance_m
        );
        prev.set(neighbor.to, current);
      }
    }
  }

  const candidateNodes = topology.nodes.filter((n) => {
    if (n.type !== params.target_type) return false;
    if (accessibleOnly && n.accessible === false) return false;
    return Number.isFinite(walkDist.get(n.id) ?? Infinity);
  });

  const ranked = candidateNodes
    .map((node) => {
      const t = telemetryMap.get(node.id);
      const distM = walkDist.get(node.id) ?? 200;
      const walkMin = Number((distM / 68).toFixed(1));
      const waitMin = Number((t?.estimated_wait_min ?? 3).toFixed(1));
      const totalMin = Number((walkMin + waitMin).toFixed(1));
      return {
        node,
        telemetry: t,
        walkMin,
        waitMin,
        totalMin,
      };
    })
    .sort((a, b) => a.totalMin - b.totalMin);

  const explicitTarget = params.target_id
    ? ranked.find((r) => r.node.id === params.target_id)
    : undefined;
  const chosen = explicitTarget ?? ranked[0];

  if (!chosen) {
    return {
      venue_id: topology.venue_id,
      generated_at: new Date().toISOString(),
      origin_node_id: params.origin,
      destination_node_id: params.origin,
      recommended_target_id: params.origin,
      estimated_total_min: 0,
      estimated_wait_min: 0,
      estimated_walk_min: 0,
      time_saved_min: 0,
      accessible_only: accessibleOnly,
      route_node_ids: [params.origin],
      steps: [
        {
          order: 1,
          node_id: params.origin,
          instruction: "You are already near an accessible area.",
          distance_m: 0,
        },
      ],
      alternatives: [],
    };
  }

  // Reconstruct route_node_ids
  const routeIds: string[] = [];
  let cursor: string | null = chosen.node.id;
  while (cursor) {
    routeIds.unshift(cursor);
    cursor = prev.get(cursor) ?? null;
  }

  const steps: RouteStep[] = routeIds.map((id, idx) => {
    const node = nodeMap.get(id);
    const prevId = idx > 0 ? routeIds[idx - 1] : null;
    const prevNode = prevId ? nodeMap.get(prevId) : null;
    const edge = prevId
      ? (adjacency.get(prevId) ?? []).find((e) => e.to === id)
      : undefined;
    const dist = Math.round(edge?.distance_m ?? 0);

    let instruction = `Start at ${node?.name ?? id}.`;
    if (idx > 0) {
      if (prevNode && node && prevNode.level !== node.level) {
        instruction = `Take ${
          accessibleOnly ? "accessible elevator/ramp" : "concourse connector"
        } to Level ${node.level} (${node.name}).`;
      } else if (idx === routeIds.length - 1) {
        instruction = `Arrive at ${node?.name ?? id} (${chosen.waitMin} min est. wait).`;
      } else {
        instruction = `Continue along ${node?.name ?? id} (${dist} m).`;
      }
    }

    return {
      order: idx + 1,
      node_id: id,
      instruction,
      distance_m: dist,
    };
  });

  const slowest = ranked[ranked.length - 1];
  const timeSaved = Math.max(
    0,
    Number(((slowest?.totalMin ?? chosen.totalMin) - chosen.totalMin).toFixed(1))
  );

  const alternatives: AlternativeFacility[] = ranked
    .filter((item) => item.node.id !== chosen.node.id)
    .slice(0, 4)
    .map((item) => ({
      node_id: item.node.id,
      name: item.node.name,
      estimated_wait_min: item.waitMin,
      congestion_score: item.telemetry?.congestion_score ?? 0.35,
    }));

  return {
    venue_id: topology.venue_id,
    generated_at: new Date().toISOString(),
    origin_node_id: params.origin,
    destination_node_id: chosen.node.id,
    recommended_target_id: chosen.node.id,
    estimated_total_min: chosen.totalMin,
    estimated_wait_min: chosen.waitMin,
    estimated_walk_min: chosen.walkMin,
    time_saved_min: timeSaved,
    accessible_only: accessibleOnly,
    route_node_ids: routeIds,
    steps,
    alternatives,
  };
}
