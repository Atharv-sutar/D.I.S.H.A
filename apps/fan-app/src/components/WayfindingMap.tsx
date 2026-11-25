"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";
import type {
  FanGuidanceResponse,
  StadiumNode,
  StadiumTopology,
  TelemetrySnapshot,
} from "@shared/types/contracts";
import { getCongestionVisuals } from "@shared/lib/congestion";

interface WayfindingMapProps {
  topology: StadiumTopology;
  telemetry: TelemetrySnapshot;
  guidance: FanGuidanceResponse | null;
}

export function WayfindingMap({
  topology,
  telemetry,
  guidance,
}: WayfindingMapProps) {
  const nodeMap = useMemo(
    () => new Map<string, StadiumNode>(topology.nodes.map((n) => [n.id, n])),
    [topology.nodes]
  );

  const telemetryMap = useMemo(
    () => new Map(telemetry.nodes.map((n) => [n.node_id, n])),
    [telemetry.nodes]
  );

  const routeLevels = useMemo(() => {
    const levels = new Set<number>();
    for (const id of guidance?.route_node_ids ?? []) {
      const lvl = nodeMap.get(id)?.level;
      if (lvl !== undefined) levels.add(lvl);
    }
    return levels;
  }, [guidance?.route_node_ids, nodeMap]);

  const [activeLevel, setActiveLevel] = useState<number>(
    topology.levels[0] ?? 1
  );

  useEffect(() => {
    if (guidance?.origin_node_id) {
      const originLevel = nodeMap.get(guidance.origin_node_id)?.level;
      if (originLevel !== undefined && !routeLevels.has(activeLevel)) {
        setActiveLevel(originLevel);
      }
    }
  }, [guidance?.origin_node_id, nodeMap, routeLevels, activeLevel]);

  const levelNodes = useMemo(
    () => topology.nodes.filter((n) => n.level === activeLevel),
    [topology.nodes, activeLevel]
  );

  const levelEdges = useMemo(
    () =>
      topology.edges.filter((edge) => {
        const from = nodeMap.get(edge.from_node);
        const to = nodeMap.get(edge.to_node);
        return from?.level === activeLevel && to?.level === activeLevel;
      }),
    [topology.edges, nodeMap, activeLevel]
  );

  const routeSegments = useMemo(() => {
    const ids = guidance?.route_node_ids ?? [];
    const segments: { from: StadiumNode; to: StadiumNode }[] = [];
    for (let i = 0; i < ids.length - 1; i++) {
      const a = nodeMap.get(ids[i]);
      const b = nodeMap.get(ids[i + 1]);
      if (a && b && a.level === activeLevel && b.level === activeLevel) {
        segments.push({ from: a, to: b });
      }
    }
    return segments;
  }, [guidance?.route_node_ids, nodeMap, activeLevel]);

  const routeSet = useMemo(
    () => new Set(guidance?.route_node_ids ?? []),
    [guidance?.route_node_ids]
  );

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">
            Live Wayfinding Map
          </h2>
          {routeLevels.size > 1 && (
            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-medium text-sky-300">
              Multi-level route
            </span>
          )}
        </div>

        <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
          {topology.levels.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setActiveLevel(lvl)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                activeLevel === lvl
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>Level {lvl}</span>
              {routeLevels.has(lvl) && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-1.5">
        <svg
          viewBox="0 0 1000 1000"
          className="h-[340px] w-full select-none sm:h-[420px]"
          role="img"
          aria-label="Stadium Wayfinding Route Map"
        >
          <ellipse
            cx="500"
            cy="500"
            rx="435"
            ry="435"
            fill="#091124"
            stroke="#1e293b"
            strokeWidth="3"
          />
          <rect
            x="380"
            y="395"
            width="240"
            height="210"
            rx="28"
            fill="#064e3b"
            fillOpacity="0.22"
            stroke="#10b981"
            strokeOpacity="0.3"
            strokeWidth="2"
          />
          <text
            x="500"
            y="505"
            textAnchor="middle"
            fill="#6ee7b7"
            fillOpacity="0.5"
            fontSize="20"
            fontWeight="600"
            letterSpacing="3"
          >
            ARENA · L{activeLevel}
          </text>

          {/* Base walkways */}
          {levelEdges.map((edge) => {
            const from = nodeMap.get(edge.from_node);
            const to = nodeMap.get(edge.to_node);
            if (!from || !to) return null;
            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#1e293b"
                strokeWidth="4"
                strokeDasharray={edge.accessible === false ? "6 6" : undefined}
              />
            );
          })}

          {/* Highlighted route path */}
          {routeSegments.map((seg, idx) => (
            <g key={`${seg.from.id}-${seg.to.id}-${idx}`}>
              <line
                x1={seg.from.x}
                y1={seg.from.y}
                x2={seg.to.x}
                y2={seg.to.y}
                stroke="#10b981"
                strokeWidth="12"
                strokeOpacity="0.25"
                strokeLinecap="round"
              />
              <line
                x1={seg.from.x}
                y1={seg.from.y}
                x2={seg.to.x}
                y2={seg.to.y}
                stroke="#34d399"
                strokeWidth="5"
                strokeDasharray="10 6"
                strokeLinecap="round"
              />
            </g>
          ))}

          {/* Nodes */}
          {levelNodes.map((node) => {
            const t = telemetryMap.get(node.id);
            const visuals = getCongestionVisuals(t?.status ?? "optimal");
            const isOrigin = guidance?.origin_node_id === node.id;
            const isDest = guidance?.destination_node_id === node.id;
            const onRoute = routeSet.has(node.id);
            const r = isOrigin || isDest ? 22 : onRoute ? 16 : 13;

            return (
              <g key={node.id}>
                {(isOrigin || isDest) && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={32}
                    fill={isDest ? "#10b981" : "#38bdf8"}
                    fillOpacity={0.22}
                    className="animate-pulse"
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={
                    isDest
                      ? "#10b981"
                      : isOrigin
                        ? "#38bdf8"
                        : visuals.hex
                  }
                  fillOpacity={onRoute ? 1 : 0.72}
                  stroke={onRoute ? "#ffffff" : "#0f172a"}
                  strokeWidth={isOrigin || isDest ? 4 : 2}
                />
                {(isOrigin || isDest) && (
                  <text
                    x={node.x}
                    y={node.y + 4}
                    textAnchor="middle"
                    fill="#020617"
                    fontSize="11"
                    fontWeight="800"
                  >
                    {isOrigin ? "YOU" : "GO"}
                  </text>
                )}
                <text
                  x={node.x}
                  y={node.y + r + 15}
                  textAnchor="middle"
                  fill={onRoute ? "#ffffff" : "#94a3b8"}
                  fontSize={onRoute ? "13" : "11"}
                  fontWeight={onRoute ? "700" : "500"}
                >
                  {node.name.replace(/\s*\(.*?\)/g, "")}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> You
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />{" "}
            Recommended
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Crowded
          </span>
        </div>
        <span>Dashed green line = optimal route</span>
      </div>
    </section>
  );
}
