"use client";

import { useState } from "react";
import { Bell, ChevronDown, ChevronUp, Navigation } from "lucide-react";
import type { FanAdvisoryItem } from "@shared/types/ws";
import { formatRelativeSeconds } from "@shared/lib/congestion";

interface AdvisoryBannerProps {
  advisories: FanAdvisoryItem[];
  onQuickRouteNode: (nodeId: string) => void;
}

export function AdvisoryBanner({
  advisories,
  onQuickRouteNode,
}: AdvisoryBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const latest = advisories[0];
  if (!latest) return null;

  const isWarning =
    latest.severity === "warning" || latest.severity === "critical";

  return (
    <section
      className={`rounded-2xl border p-3.5 transition ${
        isWarning
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-sky-500/35 bg-sky-500/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Bell
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              isWarning ? "text-amber-300" : "text-sky-300"
            }`}
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-white">
                {latest.title}
              </span>
              <span className="text-[11px] text-slate-300/80">
                {formatRelativeSeconds(latest.timestamp)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-200">{latest.message}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {latest.recommended_node_id && (
            <button
              type="button"
              onClick={() => onQuickRouteNode(latest.recommended_node_id!)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-500"
            >
              <Navigation className="h-3 w-3" />
              Go Here
            </button>
          )}
          {advisories.length > 1 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label="Toggle live advisories"
              className="rounded-lg border border-slate-700/70 bg-slate-900/70 p-1.5 text-slate-300 hover:text-white"
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {expanded && advisories.length > 1 && (
        <div className="mt-3 space-y-2 border-t border-slate-700/50 pt-2.5">
          {advisories.slice(1, 5).map((adv) => (
            <div
              key={`${adv.advisory_id}-${adv.timestamp}`}
              className="flex items-center justify-between gap-2 text-xs text-slate-300"
            >
              <div>
                <span className="font-medium text-white">{adv.title}: </span>
                <span>{adv.message}</span>
              </div>
              <span className="shrink-0 text-[10px] text-slate-400">
                {formatRelativeSeconds(adv.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
