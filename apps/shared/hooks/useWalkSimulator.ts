"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UserPosition3D, Waypoint3D } from "../types/contracts";
import { buildDetailedStadiumPath, type PathPoint3D } from "../lib/routeGeometry";

export type WalkStatus = "idle" | "walking" | "paused" | "arrived";

export interface UseWalkSimulatorOptions {
  waypoints: Waypoint3D[];
  onPositionTick: (pos: UserPosition3D) => void;
  onArrive: (finalWaypoint: Waypoint3D, pos: UserPosition3D) => void;
}

export interface UseWalkSimulatorResult {
  status: WalkStatus;
  progress: number;
  speedMultiplier: 1 | 2;
  activeWaypoint: Waypoint3D | null;
  setSpeedMultiplier: (speed: 1 | 2) => void;
  startWalk: () => void;
  pauseWalk: () => void;
  resetWalk: () => void;
}

function headingDegrees(from: PathPoint3D, to: PathPoint3D): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const rad = Math.atan2(dx, dy);
  return Number((((rad * 180) / Math.PI + 360) % 360).toFixed(1));
}

export function useWalkSimulator({
  waypoints,
  onPositionTick,
  onArrive,
}: UseWalkSimulatorOptions): UseWalkSimulatorResult {
  const [status, setStatus] = useState<WalkStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2>(1);

  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const statusRef = useRef<WalkStatus>("idle");
  const speedRef = useRef<1 | 2>(1);
  const onTickRef = useRef(onPositionTick);
  const onArriveRef = useRef(onArrive);

  onTickRef.current = onPositionTick;
  onArriveRef.current = onArrive;
  speedRef.current = speedMultiplier;
  statusRef.current = status;

  const segments = useMemo(() => {
    if (waypoints.length < 2) {
      return { items: [], totalLen: 0 };
    }
    const rawItems: {
      from: PathPoint3D;
      to: PathPoint3D;
      fromWp: Waypoint3D;
      toWp: Waypoint3D;
      len: number;
    }[] = [];
    let total = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const fromWp = waypoints[i];
      const toWp = waypoints[i + 1];
      const subPts = buildDetailedStadiumPath([fromWp, toWp]);
      for (let j = 0; j < subPts.length - 1; j++) {
        const a = subPts[j];
        const b = subPts[j + 1];
        const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        const safe = Math.max(1.5, d);
        total += safe;
        rawItems.push({ from: a, to: b, fromWp, toWp, len: safe });
      }
    }
    let acc = 0;
    const items = rawItems.map((item) => {
      const startFrac = acc / total;
      acc += item.len;
      return {
        ...item,
        startFrac,
        endFrac: acc / total,
      };
    });
    return { items, totalLen: total };
  }, [waypoints]);

  // Reset walk cleanly when route changes
  const routeSignature = useMemo(
    () => waypoints.map((w) => w.node_id).join("->"),
    [waypoints]
  );

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastFrameRef.current = null;
    progressRef.current = 0;
    setProgress(0);
    setStatus("idle");
  }, [routeSignature]);

  const sampleAt = useCallback(
    (frac: number): { pos: UserPosition3D; wp: Waypoint3D } | null => {
      if (waypoints.length === 0) return null;
      if (waypoints.length === 1 || segments.items.length === 0) {
        const w = waypoints[0];
        return {
          wp: w,
          pos: {
            x: w.x,
            y: w.y,
            z: w.z,
            level: w.level,
            heading_deg: 0,
            snapped_node_id: w.node_id,
          },
        };
      }
      const clamped = Math.max(0, Math.min(1, frac));
      const seg =
        segments.items.find(
          (s) => clamped >= s.startFrac && clamped <= s.endFrac
        ) ?? segments.items[segments.items.length - 1];

      const span = Math.max(0.0001, seg.endFrac - seg.startFrac);
      const localT = Math.max(0, Math.min(1, (clamped - seg.startFrac) / span));

      const x = seg.from.x + (seg.to.x - seg.from.x) * localT;
      const y = seg.from.y + (seg.to.y - seg.from.y) * localT;
      const z = seg.from.z + (seg.to.z - seg.from.z) * localT;
      const level = localT < 0.5 ? seg.fromWp.level : seg.toWp.level;
      const snapped = localT < 0.5 ? seg.fromWp.node_id : seg.toWp.node_id;

      return {
        wp: localT < 0.5 ? seg.fromWp : seg.toWp,
        pos: {
          x: Number(x.toFixed(1)),
          y: Number(y.toFixed(1)),
          z: Number(z.toFixed(1)),
          level,
          heading_deg: headingDegrees(seg.from, seg.to),
          snapped_node_id: snapped,
        },
      };
    },
    [segments, waypoints]
  );

  useEffect(() => {
    if (status !== "walking") {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastFrameRef.current = null;
      return;
    }

    const baseDurationSec = Math.max(5.5, Math.min(11, segments.totalLen / 34));

    const stepFrame = (now: number) => {
      if (statusRef.current !== "walking") return;
      if (lastFrameRef.current === null) {
        lastFrameRef.current = now;
      }
      const dtSec = Math.min(0.1, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      const nextProg = Math.min(
        1,
        progressRef.current + (dtSec * speedRef.current) / baseDurationSec
      );
      progressRef.current = nextProg;
      setProgress(nextProg);

      const sampled = sampleAt(nextProg);
      if (sampled) {
        onTickRef.current(sampled.pos);
      }

      if (nextProg >= 1) {
        setStatus("arrived");
        const finalWp = waypoints[waypoints.length - 1];
        if (finalWp && sampled) {
          onArriveRef.current(finalWp, sampled.pos);
        }
        return;
      }
      rafRef.current = requestAnimationFrame(stepFrame);
    };

    rafRef.current = requestAnimationFrame(stepFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [status, sampleAt, segments.totalLen, waypoints]);

  const startWalk = useCallback(() => {
    if (waypoints.length < 2) return;
    if (progressRef.current >= 1) {
      progressRef.current = 0;
      setProgress(0);
    }
    setStatus("walking");
  }, [waypoints.length]);

  const pauseWalk = useCallback(() => {
    setStatus("paused");
  }, []);

  const resetWalk = useCallback(() => {
    progressRef.current = 0;
    setProgress(0);
    setStatus("idle");
    const initial = sampleAt(0);
    if (initial) {
      onTickRef.current(initial.pos);
    }
  }, [sampleAt]);

  const activeWaypoint = useMemo(() => {
    const sampled = sampleAt(progress);
    return sampled?.wp ?? waypoints[0] ?? null;
  }, [progress, sampleAt, waypoints]);

  return {
    status,
    progress,
    speedMultiplier,
    activeWaypoint,
    setSpeedMultiplier,
    startWalk,
    pauseWalk,
    resetWalk,
  };
}
