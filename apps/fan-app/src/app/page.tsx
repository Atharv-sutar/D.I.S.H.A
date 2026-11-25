"use client";

import { useState } from "react";
import { useFanStream } from "@shared/hooks/useFanStream";
import type { RoutingQueryParams } from "@shared/types/ws";
import { FanHeader } from "@/components/FanHeader";
import { AdvisoryBanner } from "@/components/AdvisoryBanner";
import { WayfindingControls } from "@/components/WayfindingControls";
import { WayfindingMap } from "@/components/WayfindingMap";
import { RouteGuidanceSheet } from "@/components/RouteGuidanceSheet";

const INITIAL_QUERY: RoutingQueryParams = {
  origin: "transit_metro_west",
  target_type: "gate",
  accessible: false,
};

export default function FanAppPage() {
  const [params, setParams] = useState<RoutingQueryParams>(INITIAL_QUERY);

  const {
    topology,
    telemetry,
    advisories,
    guidance,
    isRouting,
    mode,
    setMode,
    connectionStatus,
    lastUpdatedAt,
    requestGuidance,
  } = useFanStream(INITIAL_QUERY);

  const handleParamsChange = (next: RoutingQueryParams) => {
    setParams(next);
    void requestGuidance(next);
  };

  const handleQuickRouteNode = (nodeId: string) => {
    const targetNode = topology.nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;
    if (
      targetNode.type === "gate" ||
      targetNode.type === "concession" ||
      targetNode.type === "restroom" ||
      targetNode.type === "seating_section"
    ) {
      handleParamsChange({
        ...params,
        target_type: targetNode.type,
        target_id: targetNode.id,
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <FanHeader
        venueName={topology.venue_name}
        eventPhase={telemetry.event_phase}
        mode={mode}
        onModeChange={setMode}
        connectionStatus={connectionStatus}
        lastUpdatedAt={lastUpdatedAt}
      />

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        <AdvisoryBanner
          advisories={advisories}
          onQuickRouteNode={handleQuickRouteNode}
        />

        <WayfindingControls
          topology={topology}
          params={params}
          isRouting={isRouting}
          onChangeParams={handleParamsChange}
        />

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <WayfindingMap
            topology={topology}
            telemetry={telemetry}
            guidance={guidance}
          />
          <RouteGuidanceSheet
            topology={topology}
            guidance={guidance}
            onSelectAlternative={(nodeId) =>
              handleParamsChange({ ...params, target_id: nodeId })
            }
          />
        </div>
      </main>
    </div>
  );
}
