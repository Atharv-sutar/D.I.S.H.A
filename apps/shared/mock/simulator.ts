import type {
  AlertIncident,
  AlternativeFacility,
  FanGuidanceResponse,
  NodeTelemetry,
  RouteStep,
  StadiumNode,
  StadiumTopology,
  TelemetrySnapshot,
  Waypoint3D,
  WaypointType,
} from "../types/contracts";
import type { FanAdvisoryItem, RoutingQueryParams } from "../types/ws";
import { scoreToCongestionLevel } from "../lib/congestion";

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function snapPositionToNodeClient(
  topology: StadiumTopology,
  x: number,
  y: number,
  level?: number
): { node: StadiumNode; distance: number } {
  const open = topology.nodes.filter((n) => n.status !== "closed");
  const pool =
    level !== undefined && open.some((n) => n.level === level)
      ? open.filter((n) => n.level === level)
      : open;
  let best = pool[0] ?? topology.nodes[0];
  let bestDist = Infinity;
  for (const node of pool) {
    const d = Math.hypot(node.x - x, node.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return { node: best, distance: Number(bestDist.toFixed(1)) };
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
    const wave = Math.sin(Date.now() / 5000 + index * 0.85);
    const jitter = (Math.random() - 0.5) * 0.045;
    const nextScore = clamp(
      Number((node.congestion_score + wave * 0.02 + jitter).toFixed(2)),
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
      ? Math.max(2, Math.round(nextScore * nextScore * 165))
      : Math.max(0, Math.round(nextScore * 35));

    const nextWait = isQueueNode
      ? Number((0.7 + nextScore * nextScore * 15.5).toFixed(1))
      : Number((0.5 + nextScore * 3.8).toFixed(1));

    const nextFlow = Math.max(
      10,
      Math.round((meta?.capacity ?? 500) * 0.08 * (1.25 - nextScore * 0.7))
    );

    totalOccupancy += nextOccupancy;
    const activeIds = node.active_incident_ids ?? [];
    const pulse = Math.min(
      1,
      Number((nextScore + (activeIds.length > 0 ? 0.22 : 0)).toFixed(2))
    );

    return {
      ...node,
      occupancy: nextOccupancy,
      congestion_score: nextScore,
      queue_length: nextQueue,
      estimated_wait_min: nextWait,
      flow_rate_per_min: nextFlow,
      trend,
      pulse_intensity: pulse,
      status:
        meta?.status === "closed"
          ? "closed"
          : scoreToCongestionLevel(nextScore),
    };
  });

  return {
    ...prev,
    timestamp: new Date().toISOString(),
    total_attendance_estimate: totalOccupancy,
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
    position: {
      x: nodeMeta?.x ?? 0,
      y: nodeMeta?.y ?? 0,
      z: nodeMeta?.z ?? 0,
      level: nodeMeta?.level ?? 0,
    },
    title: `Live Surge Detected at ${label}`,
    description: `Congestion index reached ${Math.round(
      hotspot.congestion_score * 100
    )}% with ~${hotspot.estimated_wait_min} min estimated wait.`,
    recommended_action: `Reroute incoming fans away from ${label} and open relief lanes.`,
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
  const bestName =
    nodeMeta.get(bestGate?.node_id ?? "")?.name ?? "Gate 18 (Queen's Rd)";
  const busyName =
    nodeMeta.get(busiestGate?.node_id ?? "")?.name ?? "Gate 1 (Cubbon Rd)";

  return {
    advisory_id: `adv_${Date.now().toString().slice(-5)}`,
    event:
      busiestGate && busiestGate.congestion_score > 0.78
        ? "gate_advisory"
        : "facility_alert",
    timestamp: new Date().toISOString(),
    title: `Fastest Gate: ${bestName} (${bestGate?.estimated_wait_min ?? 2} min)`,
    message: `${busyName} is at ${
      busiestGate?.estimated_wait_min ?? 12
    } min wait. Switch to ${bestName} for smoother flow.`,
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

  const resolvedOrigin = nodeMap.has(params.origin)
    ? params.origin
    : topology.nodes[0].id;

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

  const cost = new Map<string, number>();
  const walkDist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const visited = new Set<string>();

  for (const node of topology.nodes) {
    cost.set(node.id, Infinity);
    walkDist.set(node.id, Infinity);
    prev.set(node.id, null);
  }
  cost.set(resolvedOrigin, 0);
  walkDist.set(resolvedOrigin, 0);

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
      const effectiveDist = neighbor.distance_m * (1 + tScore * 2.2);
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

  const desiredType =
    params.route_mode === "entry" || params.route_mode === "exit"
      ? "gate"
      : params.target_type;

  const candidateNodes = topology.nodes.filter((n) => {
    if (n.type !== desiredType) return false;
    if (accessibleOnly && n.accessible === false) return false;
    if (params.route_mode === "exit") {
      return n.gate_role === "exit" || n.gate_role === "entry_exit";
    }
    if (params.route_mode === "entry") {
      return (
        n.gate_role === "entry" ||
        n.gate_role === "entry_exit" ||
        n.gate_role === undefined
      );
    }
    return Number.isFinite(walkDist.get(n.id) ?? Infinity);
  });

  const reachableCandidates = candidateNodes.filter((n) =>
    Number.isFinite(walkDist.get(n.id) ?? Infinity)
  );

  const ranked = reachableCandidates
    .map((node) => {
      const t = telemetryMap.get(node.id);
      const distM = walkDist.get(node.id) ?? 200;
      const walkMin = Number((distM / 72).toFixed(1));
      const waitMin = Number((t?.estimated_wait_min ?? 3).toFixed(1));
      const totalMin = Number((walkMin + waitMin).toFixed(1));
      return { node, telemetry: t, walkMin, waitMin, totalMin };
    })
    .sort((a, b) => a.totalMin - b.totalMin);

  const explicitTarget = params.target_id
    ? ranked.find((r) => r.node.id === params.target_id)
    : undefined;
  const chosen = explicitTarget ?? ranked[0];
  const originNode = nodeMap.get(resolvedOrigin) ?? topology.nodes[0];

  if (!chosen) {
    return {
      venue_id: topology.venue_id,
      generated_at: new Date().toISOString(),
      origin_node_id: resolvedOrigin,
      destination_node_id: resolvedOrigin,
      recommended_target_id: resolvedOrigin,
      user_position: {
        x: params.user_x ?? originNode.x,
        y: params.user_y ?? originNode.y,
        z: params.user_z ?? originNode.z ?? 0,
        level: params.user_level ?? originNode.level,
        heading_deg: params.heading_deg ?? 0,
        snapped_node_id: originNode.id,
      },
      target_beacon: {
        node_id: originNode.id,
        label: originNode.name,
        x: originNode.x,
        y: originNode.y,
        z: originNode.z ?? 0,
        level: originNode.level,
      },
      estimated_total_min: 0,
      estimated_wait_min: 0,
      estimated_walk_min: 0,
      time_saved_min: 0,
      accessible_only: accessibleOnly,
      route_node_ids: [resolvedOrigin],
      steps: [
        {
          order: 1,
          node_id: resolvedOrigin,
          instruction: `Start at ${originNode.name}`,
          distance_m: 0,
        },
      ],
      waypoints_3d: [
        {
          order: 1,
          node_id: resolvedOrigin,
          x: originNode.x,
          y: originNode.y,
          z: originNode.z ?? 0,
          level: originNode.level,
          waypoint_type: "origin",
          instruction: `Start at ${originNode.name}`,
          distance_m: 0,
        },
      ],
      alternatives: [],
    };
  }

  const routeIds: string[] = [];
  let cursor: string | null = chosen.node.id;
  while (cursor) {
    routeIds.unshift(cursor);
    cursor = prev.get(cursor) ?? null;
  }

  const steps: RouteStep[] = [];
  const waypoints_3d: Waypoint3D[] = [];

  routeIds.forEach((id, idx) => {
    const node = nodeMap.get(id)!;
    const prevId = idx > 0 ? routeIds[idx - 1] : null;
    const prevNode = prevId ? nodeMap.get(prevId) : null;
    const edge = prevId
      ? (adjacency.get(prevId) ?? []).find((e) => e.to === id)
      : undefined;
    const dist = Math.round(edge?.distance_m ?? 0);
    const tScore = telemetryMap.get(id)?.congestion_score ?? 0;

    let wpType: WaypointType = "checkpoint";
    let instruction = `Continue toward ${node.name} (${dist} m).`;

    if (idx === 0) {
      wpType = "origin";
      instruction = `Start at ${node.name}.`;
    } else if (idx === routeIds.length - 1) {
      wpType = "destination";
      instruction =
        params.route_mode === "exit"
          ? `Exit via ${node.name} (~${chosen.waitMin} min clearance).`
          : `Arrive at ${node.name} (~${chosen.waitMin} min wait).`;
    } else if (prevNode && prevNode.level !== node.level) {
      wpType = "level_transition";
      const verb = node.level > prevNode.level ? "Ascend" : "Descend";
      instruction = `${verb} via ${
        accessibleOnly ? "accessible ramp/lift" : "concourse stairs"
      } to Level ${node.level}: ${node.name}.`;
    } else if (tScore >= 0.7) {
      wpType = "reroute_avoidance";
      instruction = `Pass cautiously near ${node.name} (high crowd).`;
    }

    steps.push({
      order: idx + 1,
      node_id: id,
      instruction,
      distance_m: dist,
    });
    waypoints_3d.push({
      order: idx + 1,
      node_id: id,
      x: node.x,
      y: node.y,
      z: node.z ?? 0,
      level: node.level,
      waypoint_type: wpType,
      instruction,
      distance_m: dist,
    });
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
    origin_node_id: resolvedOrigin,
    destination_node_id: chosen.node.id,
    recommended_target_id: chosen.node.id,
    user_position: {
      x: params.user_x ?? originNode.x,
      y: params.user_y ?? originNode.y,
      z: params.user_z ?? originNode.z ?? 0,
      level: params.user_level ?? originNode.level,
      heading_deg: params.heading_deg ?? 0,
      snapped_node_id: originNode.id,
    },
    target_beacon: {
      node_id: chosen.node.id,
      label: chosen.node.name,
      x: chosen.node.x,
      y: chosen.node.y,
      z: chosen.node.z ?? 0,
      level: chosen.node.level,
    },
    estimated_total_min: chosen.totalMin,
    estimated_wait_min: chosen.waitMin,
    estimated_walk_min: chosen.walkMin,
    time_saved_min: timeSaved,
    accessible_only: accessibleOnly,
    route_node_ids: routeIds,
    steps,
    waypoints_3d,
    alternatives,
  };
}
