"use client";

import { Compass, Radio, Wifi, WifiOff } from "lucide-react";
import type { EventPhase } from "@shared/types/contracts";
import type { ConnectionStatus, DataSourceMode } from "@shared/types/ws";
import {
  formatEventPhase,
  formatRelativeSeconds,
} from "@shared/lib/congestion";

interface FanHeaderProps {
  venueName: string;
  eventPhase: EventPhase;
  mode: DataSourceMode;
  onModeChange: (mode: DataSourceMode) => void;
  connectionStatus: ConnectionStatus;
  lastUpdatedAt: string | null;
}

const MODES: { value: DataSourceMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "live", label: "Live" },
  { value: "simulation", label: "Sim" },
];

export function FanHeader({
  venueName,
  eventPhase,
  mode,
  onModeChange,
  connectionStatus,
  lastUpdatedAt,
}: FanHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2.5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-800">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base">
                D.I.S.H.A. Fan Guide
              </h1>
              <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                {formatEventPhase(eventPhase)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">{venueName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${
              connectionStatus === "live"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : connectionStatus === "simulation"
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-slate-100 text-slate-600"
            }`}
          >
            {connectionStatus === "live" ? (
              <Wifi className="h-3 w-3" />
            ) : connectionStatus === "simulation" ? (
              <Radio className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            <span>
              {connectionStatus === "live"
                ? "Live"
                : connectionStatus === "simulation"
                  ? "Sim"
                  : connectionStatus}
            </span>
            <span className="hidden opacity-75 sm:inline">
              · {formatRelativeSeconds(lastUpdatedAt)}
            </span>
          </span>

          <div className="flex rounded-md border border-slate-200 bg-slate-100 p-0.5 text-[11px]">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => onModeChange(m.value)}
                className={`rounded px-2.5 py-0.5 font-medium transition ${
                  mode === m.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
