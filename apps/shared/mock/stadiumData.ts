import chinnaswamyJson from "../../../contracts/venues/chinnaswamy_stadium.json";
import type {
  AlertIncident,
  NodeTelemetry,
  StadiumTopology,
  TelemetrySnapshot,
} from "../types/contracts";
import type { FanAdvisoryItem } from "../types/ws";
import { scoreToCongestionLevel } from "../lib/congestion";

export const MOCK_TOPOLOGY: StadiumTopology =
  chinnaswamyJson as unknown as StadiumTopology;

const SEED_SCORES: Record<string, number> = {
  transit_cubbon_park_metro: 0.62,
  transit_mg_road_metro: 0.55,
  gate_1_cubbon: 0.86,
  gate_4_cubbon: 0.34,
  gate_9_mg: 0.52,
  gate_14_pavilion: 0.28,
  gate_18_queens: 0.24,
  concourse_north_e: 0.72,
  concourse_east_f: 0.36,
  concourse_south_a: 0.41,
  concourse_west_pavilion: 0.29,
  concession_north_express: 0.78,
  concession_east_plaza: 0.27,
  concession_south_corner: 0.39,
  concession_west_pavilion_lounge: 0.22,
  restroom_north: 0.58,
  restroom_east: 0.25,
  restroom_south: 0.31,
  medical_east_post: 0.12,
  medical_pavilion_post: 0.1,
  stand_e_lower: 0.68,
  stand_f1_f2: 0.45,
  stand_h_upper: 0.51,
  stand_a_c_bowl: 0.48,
  stand_b_lower: 0.44,
  stand_pavilion_p2: 0.33,
};

export function createInitialTelemetry(): TelemetrySnapshot {
  const now = new Date().toISOString();
  let totalAttendance = 0;

  const nodes: NodeTelemetry[] = MOCK_TOPOLOGY.nodes.map((node) => {
    const score = SEED_SCORES[node.id] ?? 0.3;
    const occupancy = Math.round(node.capacity * score);
    totalAttendance += occupancy;
    const isQueueNode =
      node.type === "gate" ||
      node.type === "concession" ||
      node.type === "restroom";
    const queueLen = isQueueNode
      ? Math.round(occupancy * 0.25)
      : Math.round(occupancy * 0.06);
    const waitMin = Number(
      (queueLen / Math.max(8, node.capacity * 0.03)).toFixed(1)
    );
    const hasIncident =
      node.id === "gate_1_cubbon" || node.id === "concession_north_express";

    return {
      node_id: node.id,
      occupancy,
      capacity: node.capacity,
      congestion_score: score,
      queue_length: queueLen,
      estimated_wait_min: waitMin,
      flow_rate_per_min: Number(
        Math.max(8, 95 * (1.05 - score)).toFixed(1)
      ),
      trend: score >= 0.7 ? "rising" : "stable",
      status: scoreToCongestionLevel(score),
      pulse_intensity: Math.min(1, Number((score + (hasIncident ? 0.22 : 0)).toFixed(2))),
      active_incident_ids:
        node.id === "gate_1_cubbon"
          ? ["inc_gate1_surge"]
          : node.id === "concession_north_express"
            ? ["inc_food_north_bottleneck"]
            : [],
    };
  });

  return {
    venue_id: MOCK_TOPOLOGY.venue_id,
    timestamp: now,
    event_phase: "pre_event_ingress",
    total_attendance_estimate: totalAttendance,
    nodes,
  };
}

function getNodePos(nodeId: string) {
  const n = MOCK_TOPOLOGY.nodes.find((item) => item.id === nodeId);
  return {
    x: n?.x ?? 0,
    y: n?.y ?? 0,
    z: n?.z ?? 0,
    level: n?.level ?? 0,
  };
}

export function createInitialIncidents(): AlertIncident[] {
  const now = Date.now();
  return [
    {
      incident_id: "inc_gate1_surge",
      venue_id: MOCK_TOPOLOGY.venue_id,
      created_at: new Date(now - 90_000).toISOString(),
      category: "queue_surge",
      severity: "high",
      status: "open",
      node_id: "gate_1_cubbon",
      position: getNodePos("gate_1_cubbon"),
      title: "Pre-Match Entry Surge at Gate 1 (Cubbon Road)",
      description:
        "Queue velocity dropped below 35 fans/min ahead of toss; wait time exceeding 14 min.",
      recommended_action:
        "Open auxiliary lane at Gate 1 and route Cubbon Park Metro arrivals to Gate 18 or Gate 4.",
      confidence: 0.93,
    },
    {
      incident_id: "inc_food_north_bottleneck",
      venue_id: MOCK_TOPOLOGY.venue_id,
      created_at: new Date(now - 210_000).toISOString(),
      category: "crowd_bottleneck",
      severity: "medium",
      status: "acknowledged",
      node_id: "concession_north_express",
      position: getNodePos("concession_north_express"),
      title: "Concourse Bottleneck near North Food Hub (E Stand)",
      description:
        "Concession queue spilling into Rahul Dravid End walkway.",
      recommended_action:
        "Deploy 2 crowd marshals and direct fans to East Concourse Cafe (F1/F2).",
      assigned_team: "North Marshal Squad",
      confidence: 0.87,
    },
  ];
}

export function createInitialAdvisories(): FanAdvisoryItem[] {
  const now = Date.now();
  return [
    {
      advisory_id: "adv_001",
      event: "gate_advisory",
      timestamp: new Date(now - 30_000).toISOString(),
      title: "Fastest Entry & Exit: Gate 18 (Queen's Rd) & Gate 4 (Cubbon East)",
      message:
        "Gate 1 Cubbon North has a surge delay. Follow 3D waypoints to Gate 18 or Gate 4 (< 3 min wait).",
      severity: "warning",
      node_id: "gate_1_cubbon",
      recommended_node_id: "gate_18_queens",
    },
    {
      advisory_id: "adv_002",
      event: "facility_alert",
      timestamp: new Date(now - 95_000).toISOString(),
      title: "Low-Wait Refreshments: East Concourse Cafe (F1/F2)",
      message:
        "North Food Hub at E Stand is congested. East Concourse Cafe is flowing smoothly.",
      severity: "info",
      node_id: "concession_north_express",
      recommended_node_id: "concession_east_plaza",
    },
  ];
}
