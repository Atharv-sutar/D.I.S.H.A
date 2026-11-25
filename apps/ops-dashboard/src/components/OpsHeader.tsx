"use client";

import {
  Activity,
  AlertTriangle,
  Radio,
  RefreshCw,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { AlertIncident, TelemetrySnapshot } from "@shared/types/contracts";
import type { ConnectionStatus, DataSourceMode } from "@shared/types/ws";
import {
  formatEventPhase,
  formatRelativeSeconds,
} from "@shared/lib/congestion";

interface OpsHeaderProps {
  venueName: string;
  telemetry: TelemetrySnapshot;
  incidents: AlertIncident[];
  mode: DataSourceMode;
  onModeChange: (mode: DataSourceMode) => void;
  connectionStatus: ConnectionStatus;
  lastUpdatedAt: string | null;
  isStale: boolean;
  onRefresh: () => void;
}

const MODE_OPTIONS: { value: DataSourceMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "live", label: "Live API" },
  { value: "simulation", label: "Sim" },
];

export function OpsHeader({
  venueName,
  telemetry,
  incidents,
  mode,
  onModeChange,
  connectionStatus,
  lastUpdatedAt,
  isStale,
  onRefresh,
}: OpsHeaderProps) {
  const criticalCount = telemetry.nodes.filter(
    (n) => n.status === "critical" || n.status === "high"
  ).length;
  const openAlerts = incidents.filter((i) => i.status !== "resolved").length;
  const avgWait =
    telemetry.nodes.length > 0
      ? (
          telemetry.nodes.reduce((sum, n) => sum + n.estimated_wait_min, 0) /
          telemetry.nodes.length
        ).toFixed(1)
      : "0.0";

  const statusBadge = (() => {
    if (connectionStatus === "live") {
      return {
        label: "WS Live",
        cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
        icon: <Wifi className="h-3.5 w-3.5" />,
      };
    }
    if (connectionStatus === "simulation") {
      return {
        label: "Sim Stream",
        cls: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40",
        icon: <Radio className="h-3.5 w-3.5" />,
      };
    }
    if (connectionStatus === "connecting") {
      return {
        label: "Connecting",
        cls: "bg-amber-500/15 text-amber-300 border-amber-500/40",
        icon: <Activity className="h-3.5 w-3.5 animate-pulse" />,
      };
    }
    return {
      label: "Offline",
      cls: "bg-red-500/15 text-red-300 border-red-500/40",
      icon: <WifiOff className="h-3.5 w-3.5" />,
    };
  })();

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">
                D.I.S.H.A. Operations Command
              </h1>
              <span className="rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                {formatEventPhase(telemetry.event_phase)}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {venueName} · Venue ID:{" "}
              <span className="font-mono text-slate-300">
                {telemetry.venue_id}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Users className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-slate-400">Est. Crowd:</span>
              <span className="font-semibold text-white">
                {(telemetry.total_attendance_estimate ?? 0).toLocaleString()}
              </span>
            </div>
            <span className="h-3.5 w-px bg-slate-800" />
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-slate-400">Hotspots:</span>
              <span className="font-semibold text-orange-300">
                {criticalCount}
              </span>
            </div>
            <span className="h-3.5 w-px bg-slate-800" />
            <div>
              <span className="text-slate-400">Active Alerts: </span>
              <span className="font-semibold text-red-300">{openAlerts}</span>
            </div>
            <span className="hidden h-3.5 w-px bg-slate-800 md:inline-block" />
            <div className="hidden md:block">
              <span className="text-slate-400">Avg Wait: </span>
              <span className="font-semibold text-slate-100">{avgWait}m</span>
            </div>
          </div>

          <div
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadge.cls}`}
          >
            {statusBadge.icon}
            <span>{statusBadge.label}</span>
            <span className="text-[11px] opacity-80">
              · {isStale ? "Stale" : formatRelativeSeconds(lastUpdatedAt)}
            </span>
          </div>

          <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onModeChange(opt.value)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  mode === opt.value
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onRefresh}
            title="Reconnect / Refresh Telemetry"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-300 transition hover:border-slate-700 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
