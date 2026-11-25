import type { StadiumNode } from "../types/contracts";
import { SVG_SCALE, toSvgPoint } from "./congestion";

/**
 * Geometry helpers that turn the stadium routing graph into accurate 2D
 * walkway shapes. Concourse and perimeter-road edges follow the real curved
 * rings instead of cutting straight chords across the stands/pitch.
 */
export interface MapPoint2D {
  x: number;
  y: number;
}

export interface WalkGeometry {
  d: string;
  start: MapPoint2D;
  end: MapPoint2D;
  mid: MapPoint2D;
  /** Travel direction at the midpoint, in SVG degrees (0 = right). */
  headingDeg: number;
  isArc: boolean;
  /** Straight-line distance between the two nodes, in metres. */
  chordM: number;
  /** Walkable length; uses the contract edge distance when provided. */
  lengthM: number;
}

const CENTER = 500;
const CONCOURSE_RING_RADIUS_M = 90;
const GATE_RING_MIN_M = 118;
const GATE_RING_MAX_M = 132;
const RADIUS_TOLERANCE_M = 4;
const MIN_ARC_DEG = 3;

function radiusOf(node: StadiumNode): number {
  return Math.hypot(node.x, node.y);
}

function thetaOf(node: StadiumNode): number {
  return Math.atan2(node.y, node.x);
}

function shortestDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function straightGeometry(
  from: StadiumNode,
  to: StadiumNode,
  distanceM?: number
): WalkGeometry {
  const start = toSvgPoint(from.x, from.y);
  const end = toSvgPoint(to.x, to.y);
  const chordM = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    d: `M ${start.sx} ${start.sy} L ${end.sx} ${end.sy}`,
    start: { x: start.sx, y: start.sy },
    end: { x: end.sx, y: end.sy },
    mid: { x: (start.sx + end.sx) / 2, y: (start.sy + end.sy) / 2 },
    headingDeg: toDegrees(Math.atan2(end.sy - start.sy, end.sx - start.sx)),
    isArc: false,
    chordM,
    lengthM: distanceM ?? chordM,
  };
}

function ringRadiusFor(
  from: StadiumNode,
  to: StadiumNode
): number | null {
  if (from.level !== to.level) return null;

  const r1 = radiusOf(from);
  const r2 = radiusOf(to);
  if (Math.abs(r1 - r2) > RADIUS_TOLERANCE_M) return null;

  const bothConcourse =
    from.type === "concourse" && to.type === "concourse";
  const bothGates = from.type === "gate" && to.type === "gate";

  if (bothConcourse) {
    const ringR = (r1 + r2) / 2;
    return Math.abs(ringR - CONCOURSE_RING_RADIUS_M) <= RADIUS_TOLERANCE_M
      ? ringR
      : null;
  }

  if (bothGates && r1 >= GATE_RING_MIN_M && r1 <= GATE_RING_MAX_M) {
    return (r1 + r2) / 2;
  }

  return null;
}

export function buildWalkGeometry(
  from: StadiumNode,
  to: StadiumNode,
  distanceM?: number
): WalkGeometry {
  const ringR = ringRadiusFor(from, to);
  if (ringR === null) return straightGeometry(from, to, distanceM);

  const thetaStart = thetaOf(from);
  const thetaEnd = thetaOf(to);
  const delta = shortestDelta(thetaStart, thetaEnd);
  if (Math.abs(toDegrees(delta)) < MIN_ARC_DEG) {
    return straightGeometry(from, to, distanceM);
  }

  const start = toSvgPoint(from.x, from.y);
  const end = toSvgPoint(to.x, to.y);
  const radiusPx = ringR * SVG_SCALE;
  const sweep = delta < 0 ? 1 : 0;
  const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;

  const midTheta = thetaStart + delta / 2;
  const mid = {
    x: CENTER + Math.cos(midTheta) * radiusPx,
    y: CENTER - Math.sin(midTheta) * radiusPx,
  };

  // d/dtheta of (cx + r*cos, cy - r*sin) in SVG space.
  const tangentX = -Math.sin(midTheta);
  const tangentY = -Math.cos(midTheta);
  const directionX = delta < 0 ? -tangentX : tangentX;
  const directionY = delta < 0 ? -tangentY : tangentY;

  const chordM = Math.hypot(to.x - from.x, to.y - from.y);
  // Curved walking distance, unless the shared contract supplies a surveyed
  // edge length (keeps numbers consistent with the backend guidance steps).
  const arcLengthM = ringR * Math.abs(delta);

  return {
    d: `M ${start.sx} ${start.sy} A ${radiusPx.toFixed(1)} ${radiusPx.toFixed(
      1
    )} 0 ${largeArc} ${sweep} ${end.sx} ${end.sy}`,
    start: { x: start.sx, y: start.sy },
    end: { x: end.sx, y: end.sy },
    mid,
    headingDeg: toDegrees(Math.atan2(directionY, directionX)),
    isArc: true,
    chordM,
    lengthM: distanceM ?? arcLengthM,
  };
}

export function edgePairKey(fromNodeId: string, toNodeId: string): string {
  return fromNodeId < toNodeId
    ? `${fromNodeId}::${toNodeId}`
    : `${toNodeId}::${fromNodeId}`;
}

export interface PathPoint3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Expands coarse graph waypoints into a realistic stadium walking path that
 * follows curved concourse rings, outer perimeter walkways, and radial aisles
 * instead of cutting straight chords across the pitch or seating stands.
 */
export function buildDetailedStadiumPath(
  waypoints: PathPoint3D[],
  minSafeRadiusM = 74
): PathPoint3D[] {
  if (waypoints.length <= 1) return waypoints;

  const detailed: PathPoint3D[] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    if (i === 0) detailed.push({ x: a.x, y: a.y, z: a.z });

    const r1 = Math.hypot(a.x, a.y);
    const r2 = Math.hypot(b.x, b.y);
    const theta1 = Math.atan2(a.y, a.x);
    const theta2 = Math.atan2(b.y, b.x);
    let delta = theta2 - theta1;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const absDeg = Math.abs((delta * 180) / Math.PI);
    const chordDist = Math.hypot(b.x - a.x, b.y - a.y);

    // If the segment spans a curved stadium arc, interpolate in polar coordinates
    // and keep the walkway outside the cricket field boundary.
    if (absDeg > 10 && (r1 >= 65 || r2 >= 65)) {
      const steps = Math.max(6, Math.ceil(absDeg / 8));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const theta = theta1 + delta * t;
        // Smoothly interpolate radius, clamping above minSafeRadiusM when sweeping around the bowl
        const rawR = r1 + (r2 - r1) * t;
        const r =
          absDeg > 25 && rawR < minSafeRadiusM
            ? minSafeRadiusM + Math.sin(t * Math.PI) * 8
            : rawR;
        const z = a.z + (b.z - a.z) * t;
        detailed.push({
          x: Math.cos(theta) * r,
          y: Math.sin(theta) * r,
          z,
        });
      }
    } else if (chordDist > 18) {
      // Subdivide long radial/ramp segments so level transitions and curves stay smooth
      const steps = Math.max(3, Math.ceil(chordDist / 12));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        detailed.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
        });
      }
    } else {
      detailed.push({ x: b.x, y: b.y, z: b.z });
    }
  }

  const deduped: PathPoint3D[] = [];
  for (const pt of detailed) {
    const prev = deduped[deduped.length - 1];
    if (
      !prev ||
      Math.hypot(pt.x - prev.x, pt.y - prev.y, pt.z - prev.z) >= 0.25
    ) {
      deduped.push(pt);
    }
  }
  return deduped;
}
