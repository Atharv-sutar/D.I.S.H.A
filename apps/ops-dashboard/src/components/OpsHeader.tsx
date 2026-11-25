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
        cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
        icon: <Wifi className="h-3.5 w-3.5" />,
      };
    }
    if (connectionStatus === "simulation") {
      return {
        label: "Sim Stream",
        cls: "bg-blue-50 text-blue-700 border-blue-200",
        icon: <Radio className="h-3.5 w-3.5" />,
      };
    }
    if (connectionStatus === "connecting") {
      return {
        label: "Connecting",
        cls: "bg-amber-50 text-amber-700 border-amber-200",
        icon: <Activity className="h-3.5 w-3.5 animate-pulse" />,
      };
    }
    return {
      label: "Offline",
      cls: "bg-red-50 text-red-700 border-red-200",
      icon: <WifiOff className="h-3.5 w-3.5" />,
    };
  })();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-800">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                D.I.S.H.A. Operations
              </h1>
              <span className="rounded border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {formatEventPhase(telemetry.event_phase)}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {venueName} · Venue ID:{" "}
              <span className="font-mono text-slate-700">
                {telemetry.venue_id}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-slate-700">
              <Users className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-slate-500">Est. Crowd:</span>
              <span className="font-semibold text-slate-900">
                {(telemetry.total_attendance_estimate ?? 0).toLocaleString()}
              </span>
            </div>
            <span className="h-3.5 w-px bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
              <span className="text-slate-500">Hotspots:</span>
              <span className="font-semibold text-orange-700">
                {criticalCount}
              </span>
            </div>
            <span className="h-3.5 w-px bg-slate-200" />
            <div>
              <span className="text-slate-500">Active Alerts: </span>
              <span className="font-semibold text-red-700">{openAlerts}</span>
            </div>
            <span className="hidden h-3.5 w-px bg-slate-200 md:inline-block" />
            <div className="hidden md:block">
              <span className="text-slate-500">Avg Wait: </span>
              <span className="font-semibold text-slate-900">{avgWait}m</span>
            </div>
          </div>

          <div
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium ${statusBadge.cls}`}
          >
            {statusBadge.icon}
            <span>{statusBadge.label}</span>
            <span className="text-[11px] opacity-80">
              · {isStale ? "Stale" : formatRelativeSeconds(lastUpdatedAt)}
            </span>
          </div>

          <div className="flex rounded-md border border-slate-200 bg-slate-100 p-0.5 text-xs">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onModeChange(opt.value)}
                className={`rounded px-2.5 py-1 font-medium transition ${
                  mode === opt.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
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
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
