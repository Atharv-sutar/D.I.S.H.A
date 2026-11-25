"use client";

import { useMemo } from "react";
import {
  Accessibility,
  ArrowRight,
  Clock,
  Footprints,
  Sparkles,
} from "lucide-react";
import type {
  FanGuidanceResponse,
  StadiumTopology,
} from "@shared/types/contracts";
import {
  getCongestionVisuals,
  scoreToCongestionLevel,
} from "@shared/lib/congestion";

interface RouteGuidanceSheetProps {
  topology: StadiumTopology;
  guidance: FanGuidanceResponse | null;
  onSelectAlternative: (nodeId: string) => void;
}

export function RouteGuidanceSheet({
  topology,
  guidance,
  onSelectAlternative,
}: RouteGuidanceSheetProps) {
  const nodeNames = useMemo(
    () => new Map(topology.nodes.map((n) => [n.id, n.name])),
    [topology.nodes]
  );

  if (!guidance) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-center text-xs text-slate-400">
        Computing optimal stadium route...
      </section>
    );
  }

  const destName =
    nodeNames.get(guidance.recommended_target_id) ??
    guidance.recommended_target_id;

  return (
    <div className="space-y-4">
      {/* Recommendation Summary Card */}
      <section className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 via-slate-900 to-slate-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
              Recommended Destination
            </span>
            <h2 className="mt-0.5 text-lg font-bold text-white">{destName}</h2>
          </div>

          {guidance.time_saved_min > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-slate-950 shadow">
              <Sparkles className="h-3.5 w-3.5" />
              Saves {guidance.time_saved_min} min
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="text-[11px] text-slate-400">Total Time</div>
            <div className="mt-0.5 text-base font-bold text-white">
              {guidance.estimated_total_min}m
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400">
              <Footprints className="h-3 w-3" /> Walk
            </div>
            <div className="mt-0.5 text-base font-bold text-slate-200">
              {guidance.estimated_walk_min}m
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400">
              <Clock className="h-3 w-3" /> Est. Wait
            </div>
            <div className="mt-0.5 text-base font-bold text-emerald-300">
              {guidance.estimated_wait_min}m
            </div>
          </div>
        </div>

        {guidance.accessible_only && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-200">
            <Accessibility className="h-3.5 w-3.5" />
            Step-free elevator &amp; ramp route verified
          </div>
        )}
      </section>

      {/* Turn-by-Turn Steps */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">
          Step-by-Step Directions ({guidance.steps.length} steps)
        </h3>
        <ol className="space-y-2.5">
          {guidance.steps.map((step) => (
            <li
              key={`${step.order}-${step.node_id}`}
              className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-950/70 p-2.5 text-xs"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-bold text-emerald-300">
                {step.order}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-100">{step.instruction}</p>
                {step.distance_m > 0 && (
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Walk ~{step.distance_m} m
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Ranked Alternatives */}
      {guidance.alternatives.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <h3 className="mb-2.5 text-sm font-semibold text-white">
            Other Nearby Options (Tap to Switch)
          </h3>
          <div className="space-y-2">
            {guidance.alternatives.map((alt) => {
              const visuals = getCongestionVisuals(
                scoreToCongestionLevel(alt.congestion_score)
              );
              return (
                <button
                  key={alt.node_id}
                  type="button"
                  onClick={() => onSelectAlternative(alt.node_id)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-left text-xs transition hover:border-slate-700"
                >
                  <div>
                    <div className="font-semibold text-white">{alt.name}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      Est. wait: {alt.estimated_wait_min} min
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${visuals.bgClass} ${visuals.textClass} ${visuals.borderClass}`}
                    >
                      {Math.round(alt.congestion_score * 100)}% {visuals.label}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
