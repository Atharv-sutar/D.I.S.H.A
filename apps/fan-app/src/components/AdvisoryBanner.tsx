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
      className={`rounded-lg border p-3.5 transition ${
        isWarning
          ? "border-amber-300 bg-amber-50"
          : "border-blue-200 bg-blue-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Bell
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              isWarning ? "text-amber-600" : "text-blue-600"
            }`}
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-900">
                {latest.title}
              </span>
              <span className="text-[11px] text-slate-500">
                {formatRelativeSeconds(latest.timestamp)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-700">{latest.message}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {latest.recommended_node_id && (
            <button
              type="button"
              onClick={() => onQuickRouteNode(latest.recommended_node_id!)}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700"
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
              className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:text-slate-900"
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
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-2.5">
          {advisories.slice(1, 5).map((adv) => (
            <div
              key={`${adv.advisory_id}-${adv.timestamp}`}
              className="flex items-center justify-between gap-2 text-xs text-slate-700"
            >
              <div>
                <span className="font-semibold text-slate-900">{adv.title}: </span>
                <span>{adv.message}</span>
              </div>
              <span className="shrink-0 text-[10px] text-slate-500">
                {formatRelativeSeconds(adv.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
