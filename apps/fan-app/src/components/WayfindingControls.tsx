"use client";

import {
  Accessibility,
  Armchair,
  Bath,
  Cross,
  DoorOpen,
  LogOut,
  MapPin,
  Utensils,
} from "lucide-react";
import type { RouteMode, StadiumTopology } from "@shared/types/contracts";
import type { RoutingQueryParams, RoutingTargetType } from "@shared/types/ws";

interface WayfindingControlsProps {
  topology: StadiumTopology;
  params: RoutingQueryParams;
  isRouting: boolean;
  onChangeParams: (next: RoutingQueryParams) => void;
}

const TARGET_INTENTS: {
  id: string;
  type: RoutingTargetType;
  route_mode: RouteMode;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "entry_gate",
    type: "gate",
    route_mode: "entry",
    label: "Least Crowded Entry",
    subtitle: "Entry waypoints",
    icon: <DoorOpen className="h-4 w-4" />,
  },
  {
    id: "exit_gate",
    type: "gate",
    route_mode: "exit",
    label: "Fastest Exit",
    subtitle: "Exit waypoints",
    icon: <LogOut className="h-4 w-4" />,
  },
  {
    id: "concession",
    type: "concession",
    route_mode: "facility",
    label: "Food & Drinks",
    subtitle: "Walk + wait",
    icon: <Utensils className="h-4 w-4" />,
  },
  {
    id: "restroom",
    type: "restroom",
    route_mode: "facility",
    label: "Restroom",
    subtitle: "Shortest line",
    icon: <Bath className="h-4 w-4" />,
  },
  {
    id: "medical",
    type: "medical",
    route_mode: "facility",
    label: "First Aid",
    subtitle: "Medical post",
    icon: <Cross className="h-4 w-4" />,
  },
  {
    id: "seating_section",
    type: "seating_section",
    route_mode: "facility",
    label: "My Stand",
    subtitle: "To seats",
    icon: <Armchair className="h-4 w-4" />,
  },
];

export function WayfindingControls({
  topology,
  params,
  isRouting,
  onChangeParams,
}: WayfindingControlsProps) {
  const originOptions = topology.nodes.filter(
    (n) =>
      n.type === "transit" ||
      n.type === "gate" ||
      n.type === "concourse" ||
      n.type === "seating_section"
  );

  const targetCandidates = topology.nodes.filter((n) => {
    if (n.type !== params.target_type) return false;
    if (params.route_mode === "exit") {
      return n.gate_role === "exit" || n.gate_role === "entry_exit";
    }
    return true;
  });

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">
            Where are you now &amp; where to?
          </h2>
        </div>

        <button
          type="button"
          onClick={() =>
            onChangeParams({ ...params, accessible: !params.accessible })
          }
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
            params.accessible
              ? "border-sky-400/60 bg-sky-500/20 text-sky-200"
              : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"
          }`}
        >
          <Accessibility className="h-3.5 w-3.5" />
          <span>Accessible Route {params.accessible ? "ON" : "OFF"}</span>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-300">
            Current Location / Gate
          </span>
          <select
            value={params.origin}
            onChange={(e) =>
              onChangeParams({
                ...params,
                origin: e.target.value,
                user_x: undefined,
                user_y: undefined,
                user_level: undefined,
              })
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
          >
            {originOptions.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name} (Level {node.level})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-300">
            Specific Destination (Optional)
          </span>
          <select
            value={params.target_id ?? ""}
            onChange={(e) =>
              onChangeParams({
                ...params,
                target_id: e.target.value || undefined,
              })
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Auto-pick least crowded (Recommended)</option>
            {targetCandidates.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name} (L{node.level})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {TARGET_INTENTS.map((intent) => {
          const active =
            params.target_type === intent.type &&
            (intent.type !== "gate" ||
              (params.route_mode ?? "entry") === intent.route_mode);
          return (
            <button
              key={intent.id}
              type="button"
              disabled={isRouting}
              onClick={() =>
                onChangeParams({
                  ...params,
                  target_type: intent.type,
                  route_mode: intent.route_mode,
                  target_id: undefined,
                })
              }
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                active
                  ? "border-emerald-500/60 bg-emerald-500/15 text-white"
                  : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700"
              }`}
            >
              <span className={active ? "text-emerald-300" : "text-slate-400"}>
                {intent.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">
                  {intent.label}
                </span>
                <span className="block text-[10px] text-slate-400">
                  {intent.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
