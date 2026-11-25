"use client";

import { useState } from "react";
import { useOpsStream } from "@shared/hooks/useOpsStream";
import { OpsHeader } from "@/components/OpsHeader";
import { StadiumHeatmap } from "@/components/StadiumHeatmap";
import { QueueMonitor } from "@/components/QueueMonitor";
import { IncidentFeed } from "@/components/IncidentFeed";

export default function OpsDashboardPage() {
  const {
    topology,
    telemetry,
    incidents,
    mode,
    setMode,
    connectionStatus,
    lastUpdatedAt,
    isStale,
    updateIncidentStatus,
    refreshNow,
  } = useOpsStream();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    "gate_north_a"
  );

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
          <StadiumHeatmap
            topology={topology}
            telemetry={telemetry}
            incidents={incidents}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
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
