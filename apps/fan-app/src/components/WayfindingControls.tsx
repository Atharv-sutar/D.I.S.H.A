"use client";

import { useState } from "react";
import {
  Accessibility,
  Armchair,
  Bath,
  CheckCircle2,
  Cross,
  DoorOpen,
  Footprints,
  LogOut,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Ticket,
  Utensils,
} from "lucide-react";
import type { RouteMode, StadiumTopology, Waypoint3D } from "@shared/types/contracts";
import type { RoutingQueryParams, RoutingTargetType } from "@shared/types/ws";
import {
  SAMPLE_SEAT_TICKETS,
  type DetectedSeatLocation,
} from "@shared/lib/seatMapper";
import type { WalkStatus } from "@shared/hooks/useWalkSimulator";

interface WayfindingControlsProps {
  topology: StadiumTopology;
  params: RoutingQueryParams;
  isRouting: boolean;
  detectedSeat: DetectedSeatLocation | null;
  seatError: string | null;
  seatedAtSeat: boolean;
  walkStatus: WalkStatus;
  walkProgress: number;
  walkSpeed: 1 | 2;
  activeWaypoint: Waypoint3D | null;
  onChangeParams: (next: RoutingQueryParams) => void;
  onDetectSeat: (rawSeat: string) => void;
  onNavigateToSeat: () => void;
  onWalkStart: () => void;
  onWalkPause: () => void;
  onWalkReset: () => void;
  onWalkSpeedChange: (speed: 1 | 2) => void;
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
  detectedSeat,
  seatError,
  seatedAtSeat,
  walkStatus,
  walkProgress,
  walkSpeed,
  activeWaypoint,
  onChangeParams,
  onDetectSeat,
  onNavigateToSeat,
  onWalkStart,
  onWalkPause,
  onWalkReset,
  onWalkSpeedChange,
}: WayfindingControlsProps) {
  const [seatInput, setSeatInput] = useState(
    detectedSeat?.normalizedLabel ?? "E-12-45"
  );

  const originOptions = [...topology.nodes].sort((a, b) => {
    const rank = (t: string) =>
      t === "gate" ? 0 : t === "transit" ? 1 : t === "seating_section" ? 2 : 3;
    return rank(a.type) - rank(b.type);
  });

  const targetCandidates = topology.nodes.filter((n) => {
    if (n.type !== params.target_type) return false;
    if (params.route_mode === "exit") {
      return n.gate_role === "exit" || n.gate_role === "entry_exit";
    }
    return true;
  });

  const handleSeatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onDetectSeat(seatInput);
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 space-y-3.5">
      {/* Seat Ticket Detection + Walk Simulator */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-amber-500/35 bg-zinc-950/85 p-3 space-y-2">
          <form onSubmit={handleSeatSubmit} className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
              <Ticket className="h-4 w-4" />
              <span>Seat Ticket</span>
            </div>
            <input
              type="text"
              value={seatInput}
              onChange={(e) => setSeatInput(e.target.value)}
              placeholder="e.g. E-12-45, F1-06-18, H-08-14"
              className="min-w-[150px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-zinc-950 transition hover:bg-amber-400"
            >
              Detect Seat
            </button>
            {detectedSeat && (
              <button
                type="button"
                onClick={onNavigateToSeat}
                className="rounded-lg border border-rose-500/60 bg-rose-600/20 px-2.5 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-600/35"
              >
                Navigate to Seat
              </button>
            )}
          </form>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-zinc-400">Quick seats:</span>
            {SAMPLE_SEAT_TICKETS.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  setSeatInput(sample);
                  onDetectSeat(sample);
                }}
                className={`rounded border px-1.5 py-0.5 text-[10px] font-medium transition ${
                  detectedSeat?.normalizedLabel === sample
                    ? "border-amber-400 bg-amber-500/20 text-amber-200"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {sample}
              </button>
            ))}
          </div>

          {seatError && (
            <p className="text-[11px] text-red-400">{seatError}</p>
          )}
          {detectedSeat && !seatError && (
            <p className="text-[11px] text-amber-200">
              Detected <strong>{detectedSeat.normalizedLabel}</strong> in{" "}
              <strong>{detectedSeat.standName}</strong> (Row {detectedSeat.row}, Seat{" "}
              {detectedSeat.seatNum}, Level {detectedSeat.level})
            </p>
          )}
        </div>

        {/* Person Walk Simulator */}
        <div className="rounded-xl border border-rose-500/30 bg-zinc-950/85 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-200">
              <Footprints className="h-4 w-4 text-rose-400" />
              <span>Walk Simulation</span>
              {seatedAtSeat && detectedSeat && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                  <CheckCircle2 className="h-3 w-3" /> At Seat {detectedSeat.normalizedLabel}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {walkStatus === "walking" ? (
                <button
                  type="button"
                  onClick={onWalkPause}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-400"
                >
                  <Pause className="h-3.5 w-3.5" /> Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onWalkStart}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
                >
                  <Play className="h-3.5 w-3.5" />
                  {walkStatus === "paused"
                    ? "Resume"
                    : walkStatus === "arrived"
                      ? "Replay Walk"
                      : "Walk Route"}
                </button>
              )}

              <button
                type="button"
                onClick={onWalkReset}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>

              <button
                type="button"
                onClick={() => onWalkSpeedChange(walkSpeed === 1 ? 2 : 1)}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200"
              >
                {walkSpeed}x
              </button>
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 transition-all duration-150"
              style={{ width: `${Math.round(walkProgress * 100)}%` }}
            />
          </div>

          <p className="truncate text-[11px] text-zinc-300">
            {walkStatus === "arrived"
              ? `Arrived! Current location updated to ${activeWaypoint?.node_id ?? "destination"}.`
              : walkStatus === "walking"
                ? `Walking (${Math.round(walkProgress * 100)}%): ${activeWaypoint?.instruction ?? ""}`
                : "Click Navigate to Seat, then Walk Route to simulate walking to your seat."}
          </p>
        </div>
      </div>

      {/* Origin / Destination Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-rose-400" />
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
              ? "border-amber-400/60 bg-amber-500/20 text-amber-200"
              : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-600"
          }`}
        >
          <Accessibility className="h-3.5 w-3.5" />
          <span>Accessible Route {params.accessible ? "ON" : "OFF"}</span>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-zinc-300">
            Current Location / Gate {seatedAtSeat ? "(At Your Seat)" : ""}
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
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-rose-500 focus:outline-none"
          >
            {originOptions.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name} (Level {node.level})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-zinc-300">
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
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-rose-500 focus:outline-none"
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
                  ? "border-rose-500/70 bg-rose-600/20 text-white"
                  : "border-zinc-800 bg-zinc-950/75 text-zinc-300 hover:border-zinc-700"
              }`}
            >
              <span className={active ? "text-amber-300" : "text-zinc-400"}>
                {intent.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">
                  {intent.label}
                </span>
                <span className="block text-[10px] text-zinc-400">
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
