"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Accessibility,
  AlertTriangle,
  Layers,
  MapPin,
  Pause,
  Play,
  ShieldAlert,
  Siren,
  Users,
} from "lucide-react";
import type {
  AlertIncident,
  NodeTelemetry,
  NodeType,
  StadiumNode,
  StadiumTopology,
  TelemetrySnapshot,
  UserPosition3D,
} from "@shared/types/contracts";
import {
  evaluateCrowdAnomaly,
  getCongestionVisuals,
  toSvgPoint,
} from "@shared/lib/congestion";
import { StadiumMap2DBase } from "@shared/components/StadiumMap2DBase";

interface StadiumHeatmapProps {
  topology: StadiumTopology;
  telemetry: TelemetrySnapshot;
  incidents: AlertIncident[];
  activeFans?: UserPosition3D[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSimulateSurge?: (nodeId: string) => void | Promise<void>;
  onClearSurge?: (nodeId: string) => void | Promise<void>;
  simPaused?: boolean;
  onToggleSimulation?: () => void;
}

const NODE_TYPE_FILTERS: { value: "all" | NodeType; label: string }[] = [
  { value: "all", label: "All Zones" },
  { value: "gate", label: "Gates" },
  { value: "concession", label: "Concessions" },
  { value: "restroom", label: "Restrooms" },
  { value: "concourse", label: "Concourses" },
  { value: "seating_section", label: "Seating" },
];

interface NodeAnomaly {
  node: StadiumNode;
  telemetry: NodeTelemetry;
  reason: string;
  level: "critical" | "elevated";
}

interface CrowdDot {
  dx: number;
  dy: number;
  radius: number;
  opacity: number;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Deterministic crowd particle cloud around a node. Dense / critical nodes
 * pull their particles into a tight cluster, so the 2D radar visibly shows a
 * crowd "gathering" instead of a static number.
 */
function buildCrowdDots(nodeId: string, score: number, tick: number): CrowdDot[] {
  if (score < 0.3) return [];
  const count = Math.max(2, Math.min(18, Math.round(2 + score * 17)));
  const seed = hashString(nodeId);
  const spread = 16 + (1 - score) * 20;
  const dots: CrowdDot[] = [];

  for (let i = 0; i < count; i++) {
    const angle = pseudoRandom(seed + i * 13.37) * Math.PI * 2;
    // Keep particles outside the node badge so the gathering is visible.
    const radius = 18 + pseudoRandom(seed + i * 7.77) * spread;
    const drift = Math.sin(tick * 0.9 + i * 1.7) * 2.6;
    const wobble = Math.cos(tick * 0.7 + i * 0.9) * 2.2;
    dots.push({
      dx: Math.cos(angle) * radius + drift,
      dy: Math.sin(angle) * radius + wobble,
      radius: 1.7 + pseudoRandom(seed + i * 3.1) * 2.2,
      opacity: 0.5 + pseudoRandom(seed + i * 5.3) * 0.45,
    });
  }
  return dots;
}

function levelLabel(level: number): string {
  return level === 0 ? "Plaza" : `Level ${level}`;
}

export function StadiumHeatmap({
  topology,
  telemetry,
  incidents,
  activeFans = [],
  selectedNodeId,
  onSelectNode,
  onSimulateSurge,
  onClearSurge,
  simPaused = false,
  onToggleSimulation,
}: StadiumHeatmapProps) {
  const [activeLevel, setActiveLevel] = useState<number>(
    topology.levels[0] ?? 0
  );
  const [typeFilter, setTypeFilter] = useState<"all" | NodeType>("all");
  const [showCrowd, setShowCrowd] = useState(true);
  const [simTick, setSimTick] = useState(0);

  // Drives the 2D crowd particle simulation.
  useEffect(() => {
    const timer = setInterval(() => setSimTick((tick) => tick + 1), 1200);
    return () => clearInterval(timer);
  }, []);

  const telemetryMap = useMemo(
    () =>
      new Map<string, NodeTelemetry>(
        telemetry.nodes.map((n) => [n.node_id, n])
      ),
    [telemetry.nodes]
  );

  const nodeMap = useMemo(
    () => new Map<string, StadiumNode>(topology.nodes.map((n) => [n.id, n])),
    [topology.nodes]
  );

  const activeIncidentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const incident of incidents) {
      if (incident.status === "resolved") continue;
      counts.set(incident.node_id, (counts.get(incident.node_id) ?? 0) + 1);
    }
    return counts;
  }, [incidents]);

  const anomalies = useMemo(() => {
    const list: NodeAnomaly[] = [];
    for (const nodeTelemetry of telemetry.nodes) {
      const node = nodeMap.get(nodeTelemetry.node_id);
      if (!node) continue;
      const info = evaluateCrowdAnomaly(
        nodeTelemetry,
        activeIncidentCounts.get(nodeTelemetry.node_id) ?? 0
      );
      if (!info.isUnusual) continue;
      list.push({
        node,
        telemetry: nodeTelemetry,
        reason: info.reason,
        level: info.level === "critical" ? "critical" : "elevated",
      });
    }
    return list.sort((a, b) => {
      if (a.level !== b.level) return a.level === "critical" ? -1 : 1;
      return b.telemetry.congestion_score - a.telemetry.congestion_score;
    });
  }, [telemetry.nodes, nodeMap, activeIncidentCounts]);

  const anomalyNodeIds = useMemo(
    () => new Set(anomalies.map((a) => a.node.id)),
    [anomalies]
  );

  const anomalyCountByLevel = useMemo(() => {
    const counts = new Map<number, number>();
    for (const anomaly of anomalies) {
      counts.set(anomaly.node.level, (counts.get(anomaly.node.level) ?? 0) + 1);
    }
    return counts;
  }, [anomalies]);

  const levelNodes = useMemo(
    () =>
      topology.nodes.filter(
        (n) =>
          n.level === activeLevel &&
          (typeFilter === "all" || n.type === typeFilter)
      ),
    [topology.nodes, activeLevel, typeFilter]
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

  const levelFans = useMemo(
    () => activeFans.filter((fan) => fan.level === activeLevel),
    [activeFans, activeLevel]
  );

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
  const selectedTelemetry = selectedNodeId
    ? telemetryMap.get(selectedNodeId)
    : null;
  const selectedAnomaly = selectedTelemetry
    ? evaluateCrowdAnomaly(
        selectedTelemetry,
        activeIncidentCounts.get(selectedTelemetry.node_id) ?? 0
      )
    : null;

  const focusAnomaly = (anomaly: NodeAnomaly) => {
    setActiveLevel(anomaly.node.level);
    onSelectNode(anomaly.node.id);
  };

  return (
    <section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">
            2D Live Crowd Radar · Unusual Gathering Detection
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
            LIVE SIM
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onToggleSimulation && (
            <button
              type="button"
              onClick={onToggleSimulation}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                simPaused
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                  : "border-slate-700 bg-slate-950 text-slate-300 hover:border-indigo-400"
              }`}
            >
              {simPaused ? (
                <Play className="h-3 w-3" />
              ) : (
                <Pause className="h-3 w-3" />
              )}
              {simPaused ? "Resume Sim" : "Pause Sim"}
            </button>
          )}

          <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
            {topology.levels.map((lvl) => {
              const lvlMax = topology.nodes
                .filter((n) => n.level === lvl)
                .reduce((max, n) => {
                  const score = telemetryMap.get(n.id)?.congestion_score ?? 0;
                  return Math.max(max, score);
                }, 0);
              const lvlAnomalies = anomalyCountByLevel.get(lvl) ?? 0;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setActiveLevel(lvl)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition ${
                    activeLevel === lvl
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span>L{lvl}</span>
                  <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px]">
                    Peak {Math.round(lvlMax * 100)}%
                  </span>
                  {lvlAnomalies > 0 && (
                    <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {lvlAnomalies}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Global anomaly banner — directly answers "is an unusual crowd gathering?" */}
      {anomalies.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-red-200">
            <ShieldAlert className="h-4 w-4 animate-pulse text-red-400" />
            <span className="font-semibold">
              {anomalies.length} unusual crowd
              {anomalies.length === 1 ? " gathering" : " gatherings"} detected
            </span>
            <span className="text-red-300/80">
              · {anomalies.filter((a) => a.level === "critical").length} critical
              · {anomalies.filter((a) => a.level === "elevated").length} elevated
            </span>
          </div>
          <span className="text-[11px] font-medium text-red-300/80">
            Auto-flagged by the 2D crowd simulation
          </span>
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          <ShieldAlert className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold">
            No unusual crowd gathering detected — all zones flowing normally.
          </span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {NODE_TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                typeFilter === f.value
                  ? "border-indigo-500/60 bg-indigo-500/20 text-indigo-200"
                  : "border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowCrowd((value) => !value)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
            showCrowd
              ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
              : "border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          {showCrowd ? "Crowd particles ON" : "Crowd particles OFF"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-2">
          <svg
            viewBox="0 0 1000 1000"
            className="h-[440px] w-full select-none sm:h-[520px]"
            role="img"
            aria-label={`2D Stadium Level ${activeLevel} Crowd Simulation Radar`}
          >
            {/* Newer blueprint-accurate Chinnaswamy stadium base */}
            <StadiumMap2DBase
              topology={topology}
              telemetryMap={telemetryMap}
              activeLevel={activeLevel}
              selectedNodeId={selectedNodeId}
              showStandLabels={activeLevel === 0}
              onSelectStandNode={onSelectNode}
            />

            {/* Walkway edges */}
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
                  stroke="#334155"
                  strokeWidth={Math.max(2, edge.width_m * 0.7)}
                  strokeDasharray={
                    edge.accessible === false ? "8 6" : undefined
                  }
                  strokeOpacity={0.75}
                />
              );
            })}

            {/* Simulated crowd particle clusters (density from live telemetry) */}
            {showCrowd &&
              levelNodes.map((node) => {
                const t = telemetryMap.get(node.id);
                const score = t?.congestion_score ?? 0;
                const visuals = getCongestionVisuals(t?.status ?? "optimal");
                const { sx, sy } = toSvgPoint(node.x, node.y);
                const dots = buildCrowdDots(node.id, score, simTick);
                if (dots.length === 0) return null;
                return (
                  <g key={`crowd-${node.id}`} pointerEvents="none">
                    {dots.map((dot, idx) => (
                      <circle
                        key={idx}
                        cx={sx + dot.dx}
                        cy={sy + dot.dy}
                        r={dot.radius}
                        fill={visuals.hex}
                        fillOpacity={dot.opacity}
                      />
                    ))}
                  </g>
                );
              })}

            {/* Critical gathering pulse halos */}
            {levelNodes.map((node) => {
              if (!anomalyNodeIds.has(node.id)) return null;
              const t = telemetryMap.get(node.id);
              const info = evaluateCrowdAnomaly(
                t,
                activeIncidentCounts.get(node.id) ?? 0
              );
              const critical = info.level === "critical";
              const { sx, sy } = toSvgPoint(node.x, node.y);
              const score = t?.congestion_score ?? 0;
              return (
                <g key={`halo-${node.id}`} pointerEvents="none">
                  <circle
                    cx={sx}
                    cy={sy}
                    r={30 + score * 26}
                    fill={critical ? "#ef4444" : "#f59e0b"}
                    fillOpacity={critical ? 0.17 : 0.12}
                    className="animate-pulse"
                  />
                  <circle
                    cx={sx}
                    cy={sy}
                    r={22 + score * 16}
                    fill="none"
                    stroke={critical ? "#f87171" : "#fbbf24"}
                    strokeWidth="2"
                    strokeDasharray="5 5"
                    className="animate-spin"
                    style={{ transformOrigin: `${sx}px ${sy}px` }}
                  />
                </g>
              );
            })}

            {/* Simulated active fans being tracked */}
            {levelFans.map((fan, index) => {
              const { sx, sy } = toSvgPoint(fan.x, fan.y);
              const heading = fan.heading_deg ?? 0;
              const drift = Math.sin(simTick * 0.8 + index * 2.1) * 3;
              return (
                <g
                  key={`fan-${index}-${fan.snapped_node_id}`}
                  transform={`translate(${drift}, ${drift * 0.6})`}
                  pointerEvents="none"
                >
                  <g transform={`rotate(${heading} ${sx} ${sy})`}>
                    <path
                      d={`M ${sx} ${sy - 22} L ${sx - 9} ${sy - 4} L ${sx + 9} ${sy - 4} Z`}
                      fill="#38bdf8"
                      fillOpacity="0.45"
                    />
                  </g>
                  <title>
                    Tracked fan · {levelLabel(fan.level)}
                  </title>
                  <circle
                    cx={sx}
                    cy={sy}
                    r="7"
                    fill="#38bdf8"
                    stroke="#e0f2fe"
                    strokeWidth="2"
                  />
                </g>
              );
            })}

            {/* Nodes */}
            {levelNodes.map((node) => {
              const t = telemetryMap.get(node.id);
              const score = t?.congestion_score ?? 0.25;
              const visuals = getCongestionVisuals(t?.status ?? "optimal");
              const isSelected = selectedNodeId === node.id;
              const isAnomaly = anomalyNodeIds.has(node.id);
              const radius =
                node.type === "gate" || node.type === "seating_section"
                  ? 22
                  : 17;
              const { sx, sy } = toSvgPoint(node.x, node.y);

              return (
                <g
                  key={node.id}
                  className="cursor-pointer"
                  onClick={() => onSelectNode(node.id)}
                >
                  <title>{node.name}</title>
                  {(t?.status === "critical" || isAnomaly) && (
                    <circle
                      cx={sx}
                      cy={sy}
                      r={radius + 12}
                      fill={visuals.hex}
                      fillOpacity={0.22}
                      className="animate-pulse"
                    />
                  )}
                  <circle
                    cx={sx}
                    cy={sy}
                    r={radius}
                    fill={visuals.hex}
                    fillOpacity={0.9}
                    stroke={isSelected ? "#ffffff" : "#0f172a"}
                    strokeWidth={isSelected ? 4 : 2.5}
                  />
                  <text
                    x={sx}
                    y={sy + 4}
                    textAnchor="middle"
                    fill="#020617"
                    fontSize="12"
                    fontWeight="700"
                    pointerEvents="none"
                  >
                    {Math.round(score * 100)}
                  </text>
                  <text
                    x={sx}
                    y={sy + radius + 16}
                    textAnchor="middle"
                    fill="#cbd5e1"
                    fontSize="12.5"
                    fontWeight="500"
                    pointerEvents="none"
                  >
                    {node.name.replace(/\s*\(.*?\)/g, "")}
                  </text>
                  {isAnomaly && (
                    <g pointerEvents="none">
                      <rect
                        x={sx - 44}
                        y={sy - radius - 30}
                        width="88"
                        height="20"
                        rx="10"
                        fill={
                          t?.status === "critical" || score >= 0.8
                            ? "#7f1d1d"
                            : "#78350f"
                        }
                        stroke={
                          t?.status === "critical" || score >= 0.8
                            ? "#f87171"
                            : "#fbbf24"
                        }
                        strokeWidth="1"
                      />
                      <text
                        x={sx}
                        y={sy - radius - 16}
                        textAnchor="middle"
                        fill="#fee2e2"
                        fontSize="9.5"
                        fontWeight="800"
                      >
                        ⚠ UNUSUAL CROWD
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 px-2 pt-2 text-[11px] text-slate-400">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Optimal (&lt;35%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                Moderate (35–59%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                High (60–79%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                Critical (≥80%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                Tracked fan
              </span>
            </div>
            <span>Crowd dots = simulated fan particles · growing = gathering</span>
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          {/* Anomaly detection panel */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Siren
                  className={`h-4 w-4 ${
                    anomalies.length > 0
                      ? "animate-pulse text-red-400"
                      : "text-emerald-400"
                  }`}
                />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Unusual Crowd Detection
                </h3>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  anomalies.length > 0
                    ? "border-red-500/50 bg-red-500/20 text-red-300"
                    : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                }`}
              >
                {anomalies.length} flagged
              </span>
            </div>

            <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
              The 2D simulation continuously scans occupancy, queue growth and
              rising density to flag crowds that are gathering unusually fast.
            </p>

            {anomalies.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-5 text-center">
                <ShieldAlert className="mb-1.5 h-5 w-5 text-emerald-400" />
                <p className="text-xs font-semibold text-emerald-200">
                  All clear
                </p>
                <p className="mt-0.5 text-[11px] text-emerald-300/70">
                  No abnormal crowd build-up on any level.
                </p>
              </div>
            ) : (
              <ul className="max-h-[250px] space-y-2 overflow-y-auto pr-1">
                {anomalies.map((anomaly) => (
                  <li key={`anomaly-${anomaly.node.id}`}>
                    <button
                      type="button"
                      onClick={() => focusAnomaly(anomaly)}
                      className={`w-full rounded-lg border p-2 text-left transition hover:border-indigo-400/60 ${
                        anomaly.level === "critical"
                          ? "border-red-500/40 bg-red-500/10"
                          : "border-amber-500/40 bg-amber-500/10"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle
                            className={`h-3.5 w-3.5 ${
                              anomaly.level === "critical"
                                ? "text-red-400"
                                : "text-amber-400"
                            }`}
                          />
                          <span className="text-xs font-semibold text-white">
                            {anomaly.node.name.replace(/\s*\(.*?\)/g, "")}
                          </span>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            anomaly.level === "critical"
                              ? "bg-red-500/25 text-red-200"
                              : "bg-amber-500/25 text-amber-200"
                          }`}
                        >
                          {anomaly.level}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-300">
                        {anomaly.reason}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                        <span>
                          {levelLabel(anomaly.node.level)} ·{" "}
                          {Math.round(anomaly.telemetry.occupancy).toLocaleString()}{" "}
                          fans
                        </span>
                        <span>Focus →</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Selected Zone Inspector */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
            {selectedNode && selectedTelemetry ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400">
                      {selectedNode.type.replace("_", " ")} ·{" "}
                      {levelLabel(selectedNode.level)}
                    </span>
                    <h3 className="text-sm font-semibold text-white">
                      {selectedNode.name}
                    </h3>
                    <p className="font-mono text-[11px] text-slate-500">
                      {selectedNode.id} ({selectedNode.x}, {selectedNode.y})
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      getCongestionVisuals(selectedTelemetry.status).bgClass
                    } ${getCongestionVisuals(selectedTelemetry.status).textClass} ${
                      getCongestionVisuals(selectedTelemetry.status).borderClass
                    }`}
                  >
                    {getCongestionVisuals(selectedTelemetry.status).label}
                  </span>
                </div>

                {selectedAnomaly?.isUnusual && (
                  <div
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                      selectedAnomaly.level === "critical"
                        ? "border-red-500/50 bg-red-500/15 text-red-200"
                        : "border-amber-500/50 bg-amber-500/15 text-amber-200"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {selectedAnomaly.reason}
                  </div>
                )}

                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-slate-400">Congestion Index</span>
                    <span className="font-semibold text-white">
                      {Math.round(selectedTelemetry.congestion_score * 100)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${Math.round(
                          selectedTelemetry.congestion_score * 100
                        )}%`,
                        backgroundColor: getCongestionVisuals(
                          selectedTelemetry.status
                        ).hex,
                      }}
                    />
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2">
                    <dt className="text-slate-400">Occupancy</dt>
                    <dd className="mt-0.5 font-semibold text-white">
                      {selectedTelemetry.occupancy.toLocaleString()} /{" "}
                      {selectedTelemetry.capacity.toLocaleString()}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2">
                    <dt className="text-slate-400">Est. Wait</dt>
                    <dd className="mt-0.5 font-semibold text-white">
                      {selectedTelemetry.estimated_wait_min} min
                    </dd>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2">
                    <dt className="text-slate-400">Queue Length</dt>
                    <dd className="mt-0.5 font-semibold text-white">
                      {selectedTelemetry.queue_length} fans
                    </dd>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2">
                    <dt className="text-slate-400">Flow Rate</dt>
                    <dd className="mt-0.5 font-semibold text-white">
                      {selectedTelemetry.flow_rate_per_min}/min
                    </dd>
                  </div>
                </dl>

                <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-2 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Accessibility className="h-3.5 w-3.5 text-sky-400" />
                    Step-free access
                  </span>
                  <span className="font-medium text-slate-200">
                    {selectedNode.accessible !== false ? "Yes" : "Stairs only"}
                  </span>
                </div>

                {(onSimulateSurge || onClearSurge) && (
                  <div className="grid grid-cols-2 gap-2">
                    {onSimulateSurge && (
                      <button
                        type="button"
                        onClick={() => void onSimulateSurge(selectedNode.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/50 bg-red-500/15 px-2 py-1.5 text-[11px] font-semibold text-red-200 transition hover:bg-red-500/25"
                      >
                        <Siren className="h-3 w-3" />
                        Simulate Surge
                      </button>
                    )}
                    {onClearSurge && (
                      <button
                        type="button"
                        onClick={() => void onClearSurge(selectedNode.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-2 py-1.5 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
                      >
                        <ShieldAlert className="h-3 w-3" />
                        Clear Crowd
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center py-8 text-center text-xs text-slate-400">
                <MapPin className="mb-2 h-6 w-6 text-slate-500" />
                <p>
                  Click any zone node or stand sector on the 2D radar to inspect
                  live crowd telemetry.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
