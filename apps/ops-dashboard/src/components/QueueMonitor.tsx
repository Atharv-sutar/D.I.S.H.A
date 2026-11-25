"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Clock } from "lucide-react";
import type {
  NodeTelemetry,
  NodeType,
  StadiumTopology,
  TelemetrySnapshot,
} from "@shared/types/contracts";
import { getCongestionVisuals } from "@shared/lib/congestion";

interface QueueMonitorProps {
  topology: StadiumTopology;
  telemetry: TelemetrySnapshot;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

type QueueCategory = "all" | "gate" | "concession" | "restroom";

const CATEGORY_TABS: { value: QueueCategory; label: string }[] = [
  { value: "all", label: "All Queues" },
  { value: "gate", label: "Gates" },
  { value: "concession", label: "Concessions" },
  { value: "restroom", label: "Restrooms" },
];

const QUEUE_TYPES = new Set<NodeType>(["gate", "concession", "restroom"]);

function TrendPill({ trend }: { trend?: NodeTelemetry["trend"] }) {
  if (trend === "rising") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-300">
        <ArrowUpRight className="h-3 w-3" />
        Rising
      </span>
    );
  }
  if (trend === "falling") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300">
        <ArrowDownRight className="h-3 w-3" />
        Falling
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-zinc-700/40 px-1.5 py-0.5 text-[11px] font-medium text-zinc-300">
      <ArrowRight className="h-3 w-3" />
      Stable
    </span>
  );
}

export function QueueMonitor({
  topology,
  telemetry,
  selectedNodeId,
  onSelectNode,
}: QueueMonitorProps) {
  const [category, setCategory] = useState<QueueCategory>("all");

  const rows = useMemo(() => {
    const nodeMap = new Map(topology.nodes.map((n) => [n.id, n]));
    return telemetry.nodes
      .map((t) => ({ telemetry: t, meta: nodeMap.get(t.node_id) }))
      .filter((item) => {
        if (!item.meta) return false;
        if (!QUEUE_TYPES.has(item.meta.type)) return false;
        return category === "all" || item.meta.type === category;
      })
      .sort(
        (a, b) => b.telemetry.congestion_score - a.telemetry.congestion_score
      );
  }, [topology.nodes, telemetry.nodes, category]);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-teal-400" />
          <h2 className="text-sm font-semibold text-white">
            Gate &amp; Concession Queue Monitor
          </h2>
        </div>
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5 text-xs">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setCategory(tab.value)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                category === tab.value
                  ? "bg-teal-600 text-white"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-xs">
          <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="py-2 pr-3">Zone</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Queue</th>
              <th className="py-2 pr-3">Est. Wait</th>
              <th className="py-2 pr-3">Flow</th>
              <th className="py-2">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {rows.map(({ meta, telemetry: t }) => {
              if (!meta) return null;
              const visuals = getCongestionVisuals(t.status);
              const isBottleneck =
                t.status === "critical" || t.status === "high";
              const isSelected = selectedNodeId === meta.id;

              return (
                <tr
                  key={meta.id}
                  onClick={() => onSelectNode(meta.id)}
                  className={`cursor-pointer transition hover:bg-zinc-800/40 ${
                    isSelected
                      ? "bg-teal-500/15"
                      : isBottleneck
                        ? "bg-red-500/[0.04]"
                        : ""
                  }`}
                >
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-white">{meta.name}</div>
                    <div className="text-[11px] text-zinc-400">
                      L{meta.level} · {meta.type} · {t.occupancy}/{t.capacity}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${visuals.bgClass} ${visuals.textClass} ${visuals.borderClass}`}
                    >
                      {Math.round(t.congestion_score * 100)}% {visuals.label}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-zinc-200">
                    {t.queue_length} fans
                  </td>
                  <td className="py-2.5 pr-3 font-semibold text-white">
                    {t.estimated_wait_min} min
                  </td>
                  <td className="py-2.5 pr-3 text-zinc-300">
                    {t.flow_rate_per_min}/min
                  </td>
                  <td className="py-2.5">
                    <TrendPill trend={t.trend} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
