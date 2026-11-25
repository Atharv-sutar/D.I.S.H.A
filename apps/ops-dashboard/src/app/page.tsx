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
      <div className="flex h-[520px] items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-xs font-medium text-slate-600">
        Loading M. Chinnaswamy 3D Operations Map...
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
    simPaused,
    setSimPaused,
    connectionStatus,
    lastUpdatedAt,
    isStale,
    updateIncidentStatus,
    simulateCrowdSurge,
    clearCrowdSurge,
    refreshNow,
  } = useOpsStream();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    "gate_1_cubbon"
  );
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
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
            <p className="text-xs text-slate-600">
              Live M. Chinnaswamy Stadium Operations View • Tracked Fans:{" "}
              <span className="font-semibold text-slate-900">
                {activeFans.length}
              </span>
            </p>
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("3d")}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1 font-medium transition ${
                  viewMode === "3d"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Box className="h-3.5 w-3.5" />
                <span>3D Map</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("2d")}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1 font-medium transition ${
                  viewMode === "2d"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
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
              title="M. Chinnaswamy Stadium • Operations 3D Map"
              onSelectNode={setSelectedNodeId}
            />
          ) : (
            <StadiumHeatmap
              topology={topology}
              telemetry={telemetry}
              incidents={incidents}
              activeFans={activeFans}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onSimulateSurge={simulateCrowdSurge}
              onClearSurge={clearCrowdSurge}
              simPaused={simPaused}
              onToggleSimulation={() => setSimPaused(!simPaused)}
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
