"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  Ruler,
} from "lucide-react";
import type {
  FanGuidanceResponse,
  NodeTelemetry,
  StadiumNode,
  StadiumTopology,
  TelemetrySnapshot,
  UserPosition3D,
} from "@shared/types/contracts";
import { getCongestionVisuals, toSvgPoint } from "@shared/lib/congestion";
import {
  buildWalkGeometry,
  edgePairKey,
  type WalkGeometry,
} from "@shared/lib/routeGeometry";
import { useMapViewport } from "@shared/hooks/useMapViewport";
import { StadiumMap2DBase } from "@shared/components/StadiumMap2DBase";

interface WayfindingMapProps {
  topology: StadiumTopology;
  telemetry: TelemetrySnapshot;
  guidance: FanGuidanceResponse | null;
  userPosition?: UserPosition3D | null;
  onSelectNode?: (nodeId: string) => void;
  heightClassName?: string;
}

interface RouteSegment {
  key: string;
  from: StadiumNode;
  to: StadiumNode;
  geometry: WalkGeometry;
  distanceM: number;
}

function levelLabel(level: number): string {
  return level === 0 ? "Plaza" : `Level ${level}`;
}

function cleanName(name: string): string {
  return name.replace(/\s*\(.*?\)/g, "");
}

export function WayfindingMap({
  topology,
  telemetry,
  guidance,
  userPosition,
  onSelectNode,
  heightClassName = "h-[500px] sm:h-[620px] lg:h-[680px]",
}: WayfindingMapProps) {
  const nodeMap = useMemo(
    () => new Map<string, StadiumNode>(topology.nodes.map((n) => [n.id, n])),
    [topology.nodes]
  );

  const telemetryMap = useMemo(
    () => new Map<string, NodeTelemetry>(telemetry.nodes.map((n) => [n.node_id, n])),
    [telemetry.nodes]
  );

  const edgeDistanceByPair = useMemo(() => {
    const map = new Map<string, number>();
    for (const edge of topology.edges) {
      map.set(edgePairKey(edge.from_node, edge.to_node), edge.distance_m);
    }
    return map;
  }, [topology.edges]);

  const stepByNode = useMemo(
    () => new Map((guidance?.steps ?? []).map((step) => [step.node_id, step])),
    [guidance?.steps]
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

  const [expanded, setExpanded] = useState(false);
  const [showRouteDetails, setShowRouteDetails] = useState(true);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const {
    viewport,
    isDragging,
    isZoomed,
    zoomPercent,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onDoubleClick,
    consumeDragClick,
    zoomIn,
    zoomOut,
    fitTo,
    reset: resetViewport,
  } = useMapViewport(svgRef);

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

  // Keep the viewport anchored to the stadium when switching floors.
  useEffect(() => {
    resetViewport();
  }, [activeLevel, resetViewport]);

  useEffect(() => {
    if (!expanded) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [expanded]);

  const levelNodes = useMemo(
    () => topology.nodes.filter((n) => n.level === activeLevel),
    [topology.nodes, activeLevel]
  );

  const walkwayEdges = useMemo(
    () =>
      topology.edges
        .map((edge) => {
          const from = nodeMap.get(edge.from_node);
          const to = nodeMap.get(edge.to_node);
          if (!from || !to) return null;
          if (from.level !== activeLevel || to.level !== activeLevel) return null;
          return {
            edge,
            geometry: buildWalkGeometry(from, to, edge.distance_m),
          };
        })
        .filter(
          (
            item
          ): item is {
            edge: StadiumTopology["edges"][number];
            geometry: WalkGeometry;
          } => item !== null
        ),
    [topology.edges, nodeMap, activeLevel]
  );

  const routeSegments = useMemo<RouteSegment[]>(() => {
    const ids = guidance?.route_node_ids ?? [];
    const segments: RouteSegment[] = [];
    for (let i = 0; i < ids.length - 1; i++) {
      const from = nodeMap.get(ids[i]);
      const to = nodeMap.get(ids[i + 1]);
      if (!from || !to) continue;
      if (from.level !== activeLevel || to.level !== activeLevel) continue;

      const distanceM =
        stepByNode.get(to.id)?.distance_m ??
        edgeDistanceByPair.get(edgePairKey(from.id, to.id)) ??
        Math.round(Math.hypot(to.x - from.x, to.y - from.y));

      segments.push({
        key: `${from.id}->${to.id}-${i}`,
        from,
        to,
        geometry: buildWalkGeometry(from, to, distanceM),
        distanceM,
      });
    }
    return segments;
  }, [
    guidance?.route_node_ids,
    nodeMap,
    activeLevel,
    stepByNode,
    edgeDistanceByPair,
  ]);

  const routeSet = useMemo(
    () => new Set(guidance?.route_node_ids ?? []),
    [guidance?.route_node_ids]
  );

  const routeStepsOnLevel = useMemo(() => {
    const ids = guidance?.route_node_ids ?? [];
    const result: { node: StadiumNode; order: number }[] = [];
    ids.forEach((id, index) => {
      const node = nodeMap.get(id);
      if (!node || node.level !== activeLevel) return;
      result.push({ node, order: stepByNode.get(id)?.order ?? index + 1 });
    });
    return result;
  }, [guidance?.route_node_ids, nodeMap, activeLevel, stepByNode]);

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

  const routeFocusPoints = useMemo(() => {
    const points = routeStepsOnLevel.map(({ node }) => {
      const { sx, sy } = toSvgPoint(node.x, node.y);
      return { x: sx, y: sy };
    });
    if (userOnLevel && userPosition) {
      const { sx, sy } = toSvgPoint(userPosition.x, userPosition.y);
      points.push({ x: sx, y: sy });
    }
    return points;
  }, [routeStepsOnLevel, userOnLevel, userPosition]);

  const hoveredNode = hoveredNodeId ? nodeMap.get(hoveredNodeId) : undefined;
  const hoveredTelemetry = hoveredNode
    ? telemetryMap.get(hoveredNode.id)
    : undefined;

  const handleNodeClick = (nodeId: string) => {
    if (consumeDragClick()) return;
    onSelectNode?.(nodeId);
  };

  const handleFitRoute = () => {
    if (routeFocusPoints.length >= 2) {
      fitTo(routeFocusPoints);
    } else {
      resetViewport();
    }
  };

  const iconButtonClass =
    "pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/90 text-slate-300 shadow-lg transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section
      className={
        expanded
          ? "fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-slate-950 p-4 shadow-2xl sm:p-6"
          : "rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5"
      }
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
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
          {isZoomed && (
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">
              {zoomPercent}%
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
            {topology.levels.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setActiveLevel(lvl)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium transition ${
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

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-emerald-400 hover:text-emerald-200"
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
            {expanded ? "Exit full screen" : "Expand map"}
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 1000"
          className={`w-full touch-none select-none ${
            expanded
              ? "h-[calc(100vh-200px)] min-h-[440px]"
              : heightClassName
          } ${isDragging ? "cursor-grabbing" : isZoomed ? "cursor-grab" : ""}`}
          role="img"
          aria-label="2D Stadium Wayfinding Simulation Map"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onDoubleClick={onDoubleClick}
        >
          <defs>
            <radialGradient id="fan-route-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g
            transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}
          >
            {/* Newer blueprint-accurate Chinnaswamy stadium base */}
            <StadiumMap2DBase
              topology={topology}
              telemetryMap={telemetryMap}
              activeLevel={activeLevel}
              selectedNodeId={destinationNode?.id ?? null}
              showStandLabels={activeLevel === 0 || isZoomed}
              markerScale={1 / viewport.scale}
              onSelectStandNode={(nodeId) => handleNodeClick(nodeId)}
            />

            {/* Walkway graph for this level — curves follow concourse/ring roads */}
            {walkwayEdges.map(({ edge, geometry }) => (
              <path
                key={edge.id}
                d={geometry.d}
                fill="none"
                stroke="#1e293b"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={edge.accessible === false ? "6 6" : undefined}
              />
            ))}

            {/* Detailed highlighted route: corridor underlay + animated centre line */}
            {routeSegments.map((segment) => (
              <g key={segment.key}>
                <path
                  d={segment.geometry.d}
                  fill="none"
                  stroke="#022c22"
                  strokeWidth="20"
                  strokeOpacity="0.7"
                  strokeLinecap="round"
                />
                <path
                  d={segment.geometry.d}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="9"
                  strokeOpacity="0.28"
                  strokeLinecap="round"
                />
                <path
                  d={segment.geometry.d}
                  fill="none"
                  stroke="#6ee7b7"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeDasharray="14 9"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="-46"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </path>

                {/* Direction chevron locked to screen size while zooming */}
                <g
                  transform={`translate(${
                    segment.geometry.mid.x
                  } ${segment.geometry.mid.y}) rotate(${
                    segment.geometry.headingDeg
                  }) scale(${1 / viewport.scale})`}
                  pointerEvents="none"
                >
                  <path
                    d="M -6 -5 L 7 0 L -6 5 Z"
                    fill="#ecfdf5"
                    stroke="#065f46"
                    strokeWidth="1"
                  />
                </g>

                {showRouteDetails && (
                  <g
                    transform={`translate(${segment.geometry.mid.x} ${
                      segment.geometry.mid.y
                    }) scale(${1 / viewport.scale})`}
                    pointerEvents="none"
                  >
                    <g transform="translate(0 -17)">
                      <rect
                        x="-29"
                        y="-9.5"
                        width="58"
                        height="19"
                        rx="9.5"
                        fill="#020617"
                        fillOpacity="0.92"
                        stroke="#10b981"
                        strokeOpacity="0.6"
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fill="#a7f3d0"
                        fontSize="10.5"
                        fontWeight="700"
                      >
                        {Math.round(segment.distanceM)} m
                      </text>
                    </g>
                  </g>
                )}
              </g>
            ))}

            {/* Floor transition cues */}
            {transitionNodes.map((node) => {
              const { sx, sy } = toSvgPoint(node.x, node.y);
              return (
                <g
                  key={`transition-${node.id}`}
                  transform={`translate(${sx} ${sy}) scale(${
                    1 / viewport.scale
                  })`}
                  pointerEvents="none"
                >
                  <circle
                    r="24"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    className="animate-pulse"
                  />
                  <text
                    y="-28"
                    textAnchor="middle"
                    fill="#7dd3fc"
                    fontSize="12.5"
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
              const isHovered = hoveredNodeId === node.id;
              const r = (isOrigin || isDest ? 19 : onRoute ? 15 : 12) + (isHovered ? 3 : 0);
              const showLabel =
                isHovered ||
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
                  transform={`translate(${sx} ${sy})`}
                  className={onSelectNode ? "cursor-pointer" : undefined}
                  onPointerEnter={() => setHoveredNodeId(node.id)}
                  onPointerLeave={() =>
                    setHoveredNodeId((current) =>
                      current === node.id ? null : current
                    )
                  }
                  onClick={
                    onSelectNode
                      ? (event) => {
                          event.stopPropagation();
                          handleNodeClick(node.id);
                        }
                      : undefined
                  }
                >
                  <g transform={`scale(${1 / viewport.scale})`}>
                    {(isOrigin || isDest || isHovered) && (
                      <circle
                        r={isHovered ? 33 : 30}
                        fill={
                          isDest
                            ? "#10b981"
                            : isOrigin
                            ? "#38bdf8"
                            : visuals.hex
                        }
                        fillOpacity={isHovered ? 0.3 : 0.22}
                        className={isHovered ? undefined : "animate-pulse"}
                      />
                    )}
                    {isHovered && (
                      <circle
                        r={r + 6}
                        fill="none"
                        stroke="#ffffff"
                        strokeOpacity="0.45"
                        strokeWidth="1.5"
                      />
                    )}
                    <title>{node.name}</title>
                    <circle
                      r={r}
                      fill={
                        isDest ? "#10b981" : isOrigin ? "#38bdf8" : visuals.hex
                      }
                      fillOpacity={onRoute ? 1 : 0.78}
                      stroke={onRoute ? "#ffffff" : "#0f172a"}
                      strokeWidth={isOrigin || isDest ? 3.5 : 2}
                    />
                    <text
                      y="4"
                      textAnchor="middle"
                      fill="#020617"
                      fontSize="11"
                      fontWeight="800"
                      pointerEvents="none"
                    >
                      {Math.round((t?.congestion_score ?? 0.25) * 100)}
                    </text>
                    {showLabel && (
                      <text
                        y={r + 15}
                        textAnchor="middle"
                        fill={onRoute ? "#ffffff" : "#94a3b8"}
                        fontSize={onRoute ? "14" : "13"}
                        fontWeight={onRoute ? "700" : "500"}
                        pointerEvents="none"
                      >
                        {cleanName(node.name)}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}

            {/* Numbered turn markers matching the step-by-step directions */}
            {showRouteDetails &&
              routeStepsOnLevel.map(({ node, order }) => {
                const { sx, sy } = toSvgPoint(node.x, node.y);
                return (
                  <g
                    key={`route-order-${node.id}`}
                    transform={`translate(${sx + 19} ${
                      sy - 19
                    }) scale(${1 / viewport.scale})`}
                    pointerEvents="none"
                  >
                    <circle
                      r="11"
                      fill="#022c22"
                      stroke="#34d399"
                      strokeWidth="1.5"
                    />
                    <text
                      y="3.5"
                      textAnchor="middle"
                      fill="#d1fae5"
                      fontSize="11"
                      fontWeight="800"
                    >
                      {order}
                    </text>
                  </g>
                );
              })}

            {/* Destination beacon */}
            {destinationOnLevel && destinationNode && (() => {
              const { sx, sy } = toSvgPoint(destinationNode.x, destinationNode.y);
              return (
                <g
                  transform={`translate(${sx} ${sy}) scale(${
                    1 / viewport.scale
                  })`}
                  pointerEvents="none"
                >
                  <circle
                    r="42"
                    fill="url(#fan-route-glow)"
                    className="animate-pulse"
                  />
                  <text
                    y="-34"
                    textAnchor="middle"
                    fill="#a7f3d0"
                    fontSize="14"
                    fontWeight="800"
                  >
                    DESTINATION
                  </text>
                </g>
              );
            })()}

            {/* Simulated live user avatar with heading cone */}
            {userOnLevel && userPosition && (() => {
              const { sx, sy } = toSvgPoint(userPosition.x, userPosition.y);
              const heading = userPosition.heading_deg ?? 0;
              return (
                <g
                  transform={`translate(${sx} ${sy}) scale(${
                    1 / viewport.scale
                  })`}
                  pointerEvents="none"
                >
                  <g transform={`rotate(${heading})`}>
                    <path
                      d="M 0 -42 L -15 -8 L 15 -8 Z"
                      fill="#38bdf8"
                      fillOpacity="0.35"
                    />
                  </g>
                  <circle
                    r="24"
                    fill="none"
                    stroke="#38bdf8"
                    strokeOpacity="0.5"
                    strokeWidth="2"
                    className="animate-ping"
                  />
                  <circle
                    r="13"
                    fill="#38bdf8"
                    stroke="#ffffff"
                    strokeWidth="3"
                  />
                  <circle r="4" fill="#020617" />
                  <text
                    y="30"
                    textAnchor="middle"
                    fill="#7dd3fc"
                    fontSize="12.5"
                    fontWeight="800"
                  >
                    YOU
                  </text>
                </g>
              );
            })()}

            {/* Hover inspector — size stays constant while zooming */}
            {hoveredNode && (() => {
              const { sx, sy } = toSvgPoint(hoveredNode.x, hoveredNode.y);
              const visuals = getCongestionVisuals(
                hoveredTelemetry?.status ?? "optimal"
              );
              const cardW = 212;
              const cardH = 104;
              const k = 1 / viewport.scale;
              const displayW = cardW * k;
              const displayH = cardH * k;
              const placeLeft = sx > 640;
              const rawX = placeLeft ? sx - displayW - 22 : sx + 22;
              const x = Math.max(8, Math.min(992 - displayW, rawX));
              const y = Math.max(8, Math.min(992 - displayH, sy - displayH / 2));

              return (
                <g
                  transform={`translate(${x} ${y}) scale(${k})`}
                  pointerEvents="none"
                >
                  <rect
                    width={cardW}
                    height={cardH}
                    rx="12"
                    fill="#020617"
                    fillOpacity="0.96"
                    stroke={visuals.hex}
                    strokeOpacity="0.8"
                    strokeWidth="1.5"
                  />
                  <text x="12" y="20" fill="#ffffff" fontSize="12" fontWeight="700">
                    {cleanName(hoveredNode.name)}
                  </text>
                  <text x="12" y="36" fill="#94a3b8" fontSize="9.5">
                    {hoveredNode.type.replace("_", " ")} ·{" "}
                    {levelLabel(hoveredNode.level)}
                  </text>
                  <circle cx="15" cy="52" r="4" fill={visuals.hex} />
                  <text
                    x="25"
                    y="55.5"
                    fill={visuals.hex}
                    fontSize="10.5"
                    fontWeight="700"
                  >
                    {visuals.label} ·{" "}
                    {Math.round((hoveredTelemetry?.congestion_score ?? 0) * 100)}%
                  </text>
                  <text x="12" y="75" fill="#cbd5e1" fontSize="9.5">
                    Occupancy{" "}
                    {hoveredTelemetry
                      ? hoveredTelemetry.occupancy.toLocaleString()
                      : "—"}{" "}
                    /{" "}
                    {hoveredTelemetry
                      ? hoveredTelemetry.capacity.toLocaleString()
                      : "—"}
                  </text>
                  <text x="12" y="91" fill="#cbd5e1" fontSize="9.5">
                    Queue {hoveredTelemetry?.queue_length ?? 0} · Wait{" "}
                    {hoveredTelemetry?.estimated_wait_min ?? 0} min
                  </text>
                </g>
              );
            })()}
          </g>

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

        {/* Floating viewport controls */}
        <div className="pointer-events-none absolute right-2 top-2 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={zoomIn}
            className={iconButtonClass}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={zoomOut}
            className={iconButtonClass}
            title="Zoom out"
            aria-label="Zoom out"
            disabled={!isZoomed}
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleFitRoute}
            className={iconButtonClass}
            title="Fit route"
            aria-label="Fit route"
          >
            <Crosshair className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={resetViewport}
            className={iconButtonClass}
            title="Reset view"
            aria-label="Reset view"
            disabled={!isZoomed}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowRouteDetails((value) => !value)}
          className={`absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-semibold shadow-lg transition ${
            showRouteDetails
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
              : "border-slate-700 bg-slate-900/90 text-slate-400 hover:text-slate-200"
          }`}
        >
          <Ruler className="h-3 w-3" />
          {showRouteDetails ? "Route details ON" : "Route details OFF"}
        </button>

        <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-slate-950/85 px-2 py-1 text-[10px] text-slate-400">
          Drag to pan · scroll to zoom · double-click to zoom
        </div>
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
          <Layers className="h-3 w-3" /> Curved route follows real concourses
          &amp; ring roads
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
