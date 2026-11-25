"use client";

import { useMemo, useState } from "react";
import { Accessibility, Layers, MapPin } from "lucide-react";
import type {
  AlertIncident,
  NodeTelemetry,
  NodeType,
  StadiumNode,
  StadiumTopology,
  TelemetrySnapshot,
} from "@shared/types/contracts";
import { getCongestionVisuals, toSvgPoint } from "@shared/lib/congestion";

interface StadiumHeatmapProps {
  topology: StadiumTopology;
  telemetry: TelemetrySnapshot;
  incidents: AlertIncident[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

const NODE_TYPE_FILTERS: { value: "all" | NodeType; label: string }[] = [
  { value: "all", label: "All Zones" },
  { value: "gate", label: "Gates" },
  { value: "concession", label: "Concessions" },
  { value: "restroom", label: "Restrooms" },
  { value: "concourse", label: "Concourses" },
  { value: "seating_section", label: "Seating" },
];

export function StadiumHeatmap({
  topology,
  telemetry,
  incidents,
  selectedNodeId,
  onSelectNode,
}: StadiumHeatmapProps) {
  const [activeLevel, setActiveLevel] = useState<number>(
    topology.levels[0] ?? 1
  );
  const [typeFilter, setTypeFilter] = useState<"all" | NodeType>("all");

  const telemetryMap = useMemo(
    () => new Map<string, NodeTelemetry>(telemetry.nodes.map((n) => [n.node_id, n])),
    [telemetry.nodes]
  );

  const nodeMap = useMemo(
    () => new Map<string, StadiumNode>(topology.nodes.map((n) => [n.id, n])),
    [topology.nodes]
  );

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

  const openIncidentNodeIds = useMemo(
    () =>
      new Set(
        incidents
          .filter((inc) => inc.status !== "resolved")
          .map((inc) => inc.node_id)
      ),
    [incidents]
  );

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
  const selectedTelemetry = selectedNodeId
    ? telemetryMap.get(selectedNodeId)
    : null;

  return (
    <section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">
            Multi-Level Stadium Congestion Heatmap
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
            {topology.levels.map((lvl) => {
              const lvlMax = topology.nodes
                .filter((n) => n.level === lvl)
                .reduce((max, n) => {
                  const score = telemetryMap.get(n.id)?.congestion_score ?? 0;
                  return Math.max(max, score);
                }, 0);
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
                  <span>Level {lvl}</span>
                  <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px]">
                    Peak {Math.round(lvlMax * 100)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
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

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-2">
          <svg
            viewBox="0 0 1000 1000"
            className="h-[420px] w-full select-none sm:h-[480px]"
            role="img"
            aria-label={`Stadium Level ${activeLevel} Congestion Heatmap`}
          >
            {/* Stadium bowl & pitch silhouette */}
            <ellipse
              cx="500"
              cy="500"
              rx="435"
              ry="435"
              fill="#091124"
              stroke="#1e293b"
              strokeWidth="3"
            />
            <ellipse
              cx="500"
              cy="500"
              rx="295"
              ry="295"
              fill="#0b162e"
              stroke="#1e293b"
              strokeWidth="2"
              strokeDasharray="6 6"
            />
            <rect
              x="380"
              y="395"
              width="240"
              height="210"
              rx="28"
              fill="#064e3b"
              fillOpacity="0.28"
              stroke="#10b981"
              strokeOpacity="0.35"
              strokeWidth="2"
            />
            <text
              x="500"
              y="505"
              textAnchor="middle"
              fill="#6ee7b7"
              fillOpacity="0.55"
              fontSize="20"
              fontWeight="600"
              letterSpacing="3"
            >
              FIELD · L{activeLevel}
            </text>

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
                  strokeDasharray={edge.accessible === false ? "8 6" : undefined}
                  strokeOpacity={0.75}
                />
              );
            })}

            {/* Nodes */}
            {levelNodes.map((node) => {
              const t = telemetryMap.get(node.id);
              const score = t?.congestion_score ?? 0.25;
              const visuals = getCongestionVisuals(t?.status ?? "optimal");
              const isSelected = selectedNodeId === node.id;
              const hasAlert = openIncidentNodeIds.has(node.id);
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
                  {(t?.status === "critical" || hasAlert) && (
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
                    fillOpacity={0.88}
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
                  >
                    {Math.round(score * 100)}
                  </text>
                  <text
                    x={sx}
                    y={sy + radius + 16}
                    textAnchor="middle"
                    fill="#cbd5e1"
                    fontSize="13"
                    fontWeight="500"
                  >
                    {node.name.replace(/\s*\(.*?\)/g, "")}
                  </text>
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
            </div>
            <span>Dashed edges = non-accessible stairs</span>
          </div>
        </div>

        {/* Selected Zone Inspector */}
        <aside className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
          {selectedNode && selectedTelemetry ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-400">
                    {selectedNode.type.replace("_", " ")} · Level{" "}
                    {selectedNode.level}
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
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center py-8 text-center text-xs text-slate-400">
              <MapPin className="mb-2 h-6 w-6 text-slate-500" />
              <p>Click any zone node on the stadium map to inspect live queue and flow telemetry.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
