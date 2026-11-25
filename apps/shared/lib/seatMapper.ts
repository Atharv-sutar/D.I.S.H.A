import type { StadiumTopology } from "../types/contracts";

export interface DetectedSeatLocation {
  rawInput: string;
  normalizedLabel: string;
  standNodeId: string;
  standName: string;
  row: number;
  seatNum: number;
  x: number;
  y: number;
  z: number;
  level: number;
}

const STAND_PREFIX_MAP: { pattern: RegExp; nodeId: string; code: string }[] = [
  { pattern: /^H\s*U/i, nodeId: "stand_h_upper", code: "H-U" },
  { pattern: /^H/i, nodeId: "stand_h_upper", code: "H" },
  { pattern: /^E/i, nodeId: "stand_e_lower", code: "E" },
  { pattern: /^F\s*[12]?/i, nodeId: "stand_f1_f2", code: "F" },
  { pattern: /^(A|C)/i, nodeId: "stand_a_c_bowl", code: "A/C" },
  { pattern: /^B/i, nodeId: "stand_b_lower", code: "B" },
  { pattern: /^(PAV|P\s*[1-4]?|D|J|CORP)/i, nodeId: "stand_pavilion_p2", code: "P2" },
];

export const SAMPLE_SEAT_TICKETS = [
  "E-12-45",
  "F1-06-18",
  "H-08-14",
  "P2-03-10",
  "B-04-32",
  "A-09-21",
];

/**
 * Parse a Chinnaswamy Stadium seat ticket (e.g. "E-12-45", "F1-06-18", "P2-03-10")
 * and project it onto an exact 3D coordinate inside the matching stand sector.
 */
export function parseSeatTicket(
  rawInput: string,
  topology: StadiumTopology
): DetectedSeatLocation | null {
  const cleaned = rawInput.trim().toUpperCase();
  if (!cleaned) return null;

  const matchedRule = STAND_PREFIX_MAP.find((r) => r.pattern.test(cleaned));
  if (!matchedRule) return null;

  const standNode = topology.nodes.find((n) => n.id === matchedRule.nodeId);
  if (!standNode) return null;

  const numbers = cleaned.match(/\d+/g)?.map((n) => Number(n)) ?? [];
  // If prefix itself had a digit like F1 or P2, separate stand sub-digit if 3+ numbers exist
  let row = 8;
  let seatNum = 20;
  if (numbers.length >= 3) {
    row = Math.max(1, Math.min(40, numbers[1]));
    seatNum = Math.max(1, Math.min(80, numbers[2]));
  } else if (numbers.length === 2) {
    row = Math.max(1, Math.min(40, numbers[0]));
    seatNum = Math.max(1, Math.min(80, numbers[1]));
  } else if (numbers.length === 1) {
    seatNum = Math.max(1, Math.min(80, numbers[0]));
  }

  const sector = topology.hologram_spec?.stand_sectors?.find(
    (s) => s.linked_node_id === standNode.id
  );

  let x = standNode.x;
  let y = standNode.y;
  let z = standNode.z ?? 6.5;

  if (sector) {
    const rowFrac = (row - 1) / 39;
    const seatFrac = (seatNum - 1) / 79;
    const angleDeg =
      sector.start_deg + (sector.end_deg - sector.start_deg) * (0.15 + seatFrac * 0.7);
    const radius =
      sector.inner_radius_m +
      (sector.outer_radius_m - sector.inner_radius_m) * (0.2 + rowFrac * 0.65);
    const rad = (angleDeg * Math.PI) / 180;
    x = Number((Math.cos(rad) * radius).toFixed(1));
    y = Number((Math.sin(rad) * radius).toFixed(1));
    z = Number((sector.elevation_m + sector.height_m * (0.25 + rowFrac * 0.55)).toFixed(1));
  }

  return {
    rawInput,
    normalizedLabel: cleaned,
    standNodeId: standNode.id,
    standName: standNode.name,
    row,
    seatNum,
    x,
    y,
    z,
    level: standNode.level,
  };
}
