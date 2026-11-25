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
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2.5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white sm:text-base">
                D.I.S.H.A. Fan Guide
              </h1>
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                {formatEventPhase(eventPhase)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">{venueName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              connectionStatus === "live"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : connectionStatus === "simulation"
                  ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                  : "border-slate-700 bg-slate-900 text-slate-300"
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

          <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-[11px]">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => onModeChange(m.value)}
                className={`rounded-md px-2 py-0.5 font-medium transition ${
                  mode === m.value
                    ? "bg-emerald-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
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
