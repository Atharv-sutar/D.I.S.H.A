"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, MapPin, Navigation } from "lucide-react";
import type {
  FanGuidanceResponse,
  StadiumNode,
  StadiumTopology,
  TelemetrySnapshot,
  UserPosition3D,
} from "@shared/types/contracts";
import { getCongestionVisuals, toSvgPoint } from "@shared/lib/congestion";
import { StadiumMap2DBase } from "@shared/components/StadiumMap2DBase";

interface WayfindingMapProps {
  topology: StadiumTopology;
  telemetry: TelemetrySnapshot;
  guidance: FanGuidanceResponse | null;
  userPosition?: UserPosition3D | null;
  onSelectNode?: (nodeId: string) => void;
  heightClassName?: string;
}

function levelLabel(level: number): string {
  return level === 0 ? "Plaza" : `Level ${level}`;
}

export function WayfindingMap({
  topology,
  telemetry,
  guidance,
  userPosition,
  onSelectNode,
  heightClassName = "h-[380px] sm:h-[460px]",
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

  const [activeLevel, setActiveLevel] = useState<number>(() => {
    const originLevel = guidance?.origin_node_id
      ? nodeMap.get(guidance.origin_node_id)?.level
      : undefined;
    return originLevel ?? userPosition?.level ?? topology.levels[0] ?? 0;
  });

  // Jump to the route's origin level whenever a new route is generated,
  // but never fight the user while they are browsing a level on the route.
  useEffect(() => {
    if (!guidance?.origin_node_id) return;
    const originLevel = nodeMap.get(guidance.origin_node_id)?.level;
    if (originLevel !== undefined && !routeLevels.has(activeLevel)) {
      setActiveLevel(originLevel);
    }
  }, [guidance?.origin_node_id, nodeMap, routeLevels, activeLevel]);

  // Follow the simulated fan when they cross to another stadium level while
  // walking (but not when the user manually browses another level).
  const userLevel = userPosition?.level ?? null;
  const previousUserLevel = useRef<number | null>(null);
  useEffect(() => {
    if (userLevel === null) return;
    const previous = previousUserLevel.current;
    previousUserLevel.current = userLevel;
    if (
      previous !== null &&
      previous !== userLevel &&
      routeLevels.has(userLevel)
    ) {
      setActiveLevel(userLevel);
    }
  }, [userLevel, routeLevels]);

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

  const destinationNode = guidance?.destination_node_id
    ? nodeMap.get(guidance.destination_node_id)
    : undefined;
  const destinationOnLevel = destinationNode?.level === activeLevel;
  const userOnLevel = userPosition?.level === activeLevel;

  // Nodes where the route crosses between floors need a visible cue.
  const transitionNodes = useMemo(() => {
    const ids = guidance?.route_node_ids ?? [];
    const result: StadiumNode[] = [];
    for (let i = 0; i < ids.length; i++) {
      const node = nodeMap.get(ids[i]);
      if (!node || node.level !== activeLevel) continue;
      const prev = i > 0 ? nodeMap.get(ids[i - 1]) : undefined;
      const next = i < ids.length - 1 ? nodeMap.get(ids[i + 1]) : undefined;
      if (
        (prev && prev.level !== node.level) ||
        (next && next.level !== node.level)
      ) {
        result.push(node);
      }
    }
    return result;
  }, [guidance?.route_node_ids, nodeMap, activeLevel]);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">
            2D Live Stadium Navigation Map
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            LIVE SIM
          </span>
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
              <span>L{lvl}</span>
              <span className="hidden sm:inline">{levelLabel(lvl)}</span>
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
          className={`${heightClassName} w-full select-none`}
          role="img"
          aria-label="2D Stadium Wayfinding Simulation Map"
        >
          <defs>
            <radialGradient id="fan-route-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Newer blueprint-accurate Chinnaswamy stadium base */}
          <StadiumMap2DBase
            topology={topology}
            telemetryMap={telemetryMap}
            activeLevel={activeLevel}
            selectedNodeId={destinationNode?.id ?? null}
            showStandLabels={activeLevel === 0}
            onSelectStandNode={onSelectNode}
          />

          {/* Walkway graph for this level */}
          {levelEdges.map((edge) => {
            const from = nodeMap.get(edge.from_node);
            const to = nodeMap.get(edge.to_node);
            if (!from || !to) return null;
            const p1 = toSvgPoint(from.x, from.y);
            const p2 = toSvgPoint(to.x, to.y);
            return (
              <line
                key={edge.id}
                x1={p1.sx}
                y1={p1.sy}
                x2={p2.sx}
                y2={p2.sy}
                stroke="#1e293b"
                strokeWidth="4"
                strokeDasharray={edge.accessible === false ? "6 6" : undefined}
              />
            );
          })}

          {/* Highlighted route path */}
          {routeSegments.map((seg, idx) => {
            const p1 = toSvgPoint(seg.from.x, seg.from.y);
            const p2 = toSvgPoint(seg.to.x, seg.to.y);
            return (
              <g key={`${seg.from.id}-${seg.to.id}-${idx}`}>
                <line
                  x1={p1.sx}
                  y1={p1.sy}
                  x2={p2.sx}
                  y2={p2.sy}
                  stroke="#10b981"
                  strokeWidth="16"
                  strokeOpacity="0.18"
                  strokeLinecap="round"
                />
                <line
                  x1={p1.sx}
                  y1={p1.sy}
                  x2={p2.sx}
                  y2={p2.sy}
                  stroke="#34d399"
                  strokeWidth="5"
                  strokeDasharray="10 6"
                  strokeLinecap="round"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="-32"
                    dur="1.1s"
                    repeatCount="indefinite"
                  />
                </line>
              </g>
            );
          })}

          {/* Floor transition cues */}
          {transitionNodes.map((node) => {
            const { sx, sy } = toSvgPoint(node.x, node.y);
            return (
              <g key={`transition-${node.id}`} pointerEvents="none">
                <circle
                  cx={sx}
                  cy={sy}
                  r="24"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  className="animate-pulse"
                />
                <text
                  x={sx}
                  y={sy - 28}
                  textAnchor="middle"
                  fill="#7dd3fc"
                  fontSize="11"
                  fontWeight="700"
                >
                  ↕ Level change
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {levelNodes.map((node) => {
            const t = telemetryMap.get(node.id);
            const visuals = getCongestionVisuals(t?.status ?? "optimal");
            const isOrigin = guidance?.origin_node_id === node.id;
            const isDest = destinationOnLevel && destinationNode?.id === node.id;
            const onRoute = routeSet.has(node.id);
            const r = isOrigin || isDest ? 19 : onRoute ? 15 : 12;
            const showLabel =
              onRoute ||
              isOrigin ||
              isDest ||
              node.type === "gate" ||
              node.type === "transit" ||
              node.type === "seating_section" ||
              node.type === "concourse";
            const { sx, sy } = toSvgPoint(node.x, node.y);

            return (
              <g
                key={node.id}
                className={onSelectNode ? "cursor-pointer" : undefined}
                onClick={
                  onSelectNode
                    ? (event) => {
                        event.stopPropagation();
                        onSelectNode(node.id);
                      }
                    : undefined
                }
              >
                {(isOrigin || isDest) && (
                  <circle
                    cx={sx}
                    cy={sy}
                    r={30}
                    fill={isDest ? "#10b981" : "#38bdf8"}
                    fillOpacity={0.22}
                    className="animate-pulse"
                  />
                )}
                <title>{node.name}</title>
                <circle
                  cx={sx}
                  cy={sy}
                  r={r}
                  fill={
                    isDest ? "#10b981" : isOrigin ? "#38bdf8" : visuals.hex
                  }
                  fillOpacity={onRoute ? 1 : 0.74}
                  stroke={onRoute ? "#ffffff" : "#0f172a"}
                  strokeWidth={isOrigin || isDest ? 3.5 : 2}
                />
                <text
                  x={sx}
                  y={sy + 4}
                  textAnchor="middle"
                  fill="#020617"
                  fontSize="10"
                  fontWeight="800"
                  pointerEvents="none"
                >
                  {Math.round((t?.congestion_score ?? 0.25) * 100)}
                </text>
                {showLabel && (
                  <text
                    x={sx}
                    y={sy + r + 15}
                    textAnchor="middle"
                    fill={onRoute ? "#ffffff" : "#94a3b8"}
                    fontSize={onRoute ? "12" : "10.5"}
                    fontWeight={onRoute ? "700" : "500"}
                    pointerEvents="none"
                  >
                    {node.name.replace(/\s*\(.*?\)/g, "")}
                  </text>
                )}
              </g>
            );
          })}

          {/* Destination beacon */}
          {destinationOnLevel && destinationNode && (
            <g pointerEvents="none">
              <circle
                cx={toSvgPoint(destinationNode.x, destinationNode.y).sx}
                cy={toSvgPoint(destinationNode.x, destinationNode.y).sy}
                r="42"
                fill="url(#fan-route-glow)"
                className="animate-pulse"
              />
              <text
                x={toSvgPoint(destinationNode.x, destinationNode.y).sx}
                y={toSvgPoint(destinationNode.x, destinationNode.y).sy - 34}
                textAnchor="middle"
                fill="#a7f3d0"
                fontSize="12"
                fontWeight="800"
              >
                DESTINATION
              </text>
            </g>
          )}

          {/* Simulated live user avatar with heading cone */}
          {userOnLevel && userPosition && (() => {
            const { sx, sy } = toSvgPoint(userPosition.x, userPosition.y);
            const heading = userPosition.heading_deg ?? 0;
            return (
              <g pointerEvents="none">
                <g transform={`rotate(${heading} ${sx} ${sy})`}>
                  <path
                    d={`M ${sx} ${sy - 42} L ${sx - 15} ${sy - 8} L ${sx + 15} ${sy - 8} Z`}
                    fill="#38bdf8"
                    fillOpacity="0.35"
                  />
                </g>
                <circle
                  cx={sx}
                  cy={sy}
                  r="24"
                  fill="none"
                  stroke="#38bdf8"
                  strokeOpacity="0.5"
                  strokeWidth="2"
                  className="animate-ping"
                />
                <circle
                  cx={sx}
                  cy={sy}
                  r="13"
                  fill="#38bdf8"
                  stroke="#ffffff"
                  strokeWidth="3"
                />
                <circle cx={sx} cy={sy} r="4" fill="#020617" />
                <text
                  x={sx}
                  y={sy + 30}
                  textAnchor="middle"
                  fill="#7dd3fc"
                  fontSize="11"
                  fontWeight="800"
                >
                  YOU
                </text>
              </g>
            );
          })()}

          {/* Outside-the-bowl location marker (level 0) */}
          {!userOnLevel && userPosition && (
            <text
              x="500"
              y="966"
              textAnchor="middle"
              fill="#38bdf8"
              fontSize="12"
              fontWeight="600"
            >
              You are on {levelLabel(userPosition.level)} · switch level to see
              your avatar
            </text>
          )}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> You
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />{" "}
            Recommended
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3 text-emerald-300" /> Destination
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Crowded
          </span>
        </div>
        <span className="flex items-center gap-1">
          <Layers className="h-3 w-3" /> Animated green line = live optimal route
        </span>
      </div>

      {guidance && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1.5">
            <p className="text-slate-400">Walk</p>
            <p className="font-semibold text-white">
              {guidance.estimated_walk_min} min
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1.5">
            <p className="text-slate-400">Wait</p>
            <p className="font-semibold text-white">
              {guidance.estimated_wait_min} min
            </p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5">
            <p className="text-emerald-300/80">Time saved</p>
            <p className="font-semibold text-emerald-300">
              {guidance.time_saved_min} min
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
