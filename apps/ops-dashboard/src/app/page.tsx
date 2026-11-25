"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Box, Layers } from "lucide-react";
import { useOpsStream } from "@shared/hooks/useOpsStream";
import { OpsHeader } from "@/components/OpsHeader";
import { StadiumHeatmap } from "@/components/StadiumHeatmap";
import { QueueMonitor } from "@/components/QueueMonitor";
import { IncidentFeed } from "@/components/IncidentFeed";

const StadiumHologram3D = dynamic(
  () =>
    import("@shared/components/StadiumHologram3D").then(
      (mod) => mod.StadiumHologram3D
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[520px] items-center justify-center rounded-2xl border border-cyan-500/30 bg-[#030816] text-xs font-medium text-cyan-300">
        Initializing M. Chinnaswamy 3D Operations Hologram...
      </div>
    ),
  }
);

export default function OpsDashboardPage() {
  const {
    topology,
    telemetry,
    incidents,
    activeFans,
    mode,
    setMode,
    connectionStatus,
    lastUpdatedAt,
    isStale,
    updateIncidentStatus,
    refreshNow,
  } = useOpsStream();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    "gate_1_cubbon"
  );
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <OpsHeader
        venueName={topology.venue_name}
        telemetry={telemetry}
        incidents={incidents}
        mode={mode}
        onModeChange={setMode}
        connectionStatus={connectionStatus}
        lastUpdatedAt={lastUpdatedAt}
        isStale={isStale}
        onRefresh={() => void refreshNow()}
      />

      <main className="mx-auto grid max-w-[1600px] gap-4 p-4 sm:p-6 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">
              Live M. Chinnaswamy Stadium Operations View • Tracked Fans:{" "}
              <span className="font-semibold text-cyan-300">
                {activeFans.length}
              </span>
            </p>
            <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900 p-1 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("3d")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 font-semibold transition ${
                  viewMode === "3d"
                    ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Box className="h-3.5 w-3.5" />
                <span>3D Hologram</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("2d")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 font-semibold transition ${
                  viewMode === "2d"
                    ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/50"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>2D Heatmap</span>
              </button>
            </div>
          </div>

          {viewMode === "3d" ? (
            <StadiumHologram3D
              topology={topology}
              telemetry={telemetry}
              incidents={incidents}
              activeFans={activeFans}
              selectedNodeId={selectedNodeId}
              heightClassName="h-[460px] sm:h-[540px]"
              title="M. Chinnaswamy Stadium • 3D Operations Hologram"
              onSelectNode={setSelectedNodeId}
            />
          ) : (
            <StadiumHeatmap
              topology={topology}
              telemetry={telemetry}
              incidents={incidents}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
            />
          )}

          <QueueMonitor
            topology={topology}
            telemetry={telemetry}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>

        <div>
          <IncidentFeed
            topology={topology}
            incidents={incidents}
            onUpdateStatus={updateIncidentStatus}
            onFocusNode={setSelectedNodeId}
          />
        </div>
      </main>
    </div>
  );
}
