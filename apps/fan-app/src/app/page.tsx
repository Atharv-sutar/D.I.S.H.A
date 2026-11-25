"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Box, Map as MapIcon } from "lucide-react";
import { useFanStream } from "@shared/hooks/useFanStream";
import type { RoutingQueryParams } from "@shared/types/ws";
import { FanHeader } from "@/components/FanHeader";
import { AdvisoryBanner } from "@/components/AdvisoryBanner";
import { WayfindingControls } from "@/components/WayfindingControls";
import { WayfindingMap } from "@/components/WayfindingMap";
import { RouteGuidanceSheet } from "@/components/RouteGuidanceSheet";

const StadiumHologram3D = dynamic(
  () =>
    import("@shared/components/StadiumHologram3D").then(
      (mod) => mod.StadiumHologram3D
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[500px] items-center justify-center rounded-2xl border border-cyan-500/30 bg-[#030816] text-xs font-medium text-cyan-300">
        Initializing M. Chinnaswamy 3D Hologram...
      </div>
    ),
  }
);

const INITIAL_QUERY: RoutingQueryParams = {
  origin: "transit_cubbon_park_metro",
  target_type: "gate",
  route_mode: "entry",
  accessible: false,
};

export default function FanAppPage() {
  const [params, setParams] = useState<RoutingQueryParams>(INITIAL_QUERY);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    "gate_18_queens"
  );

  const {
    topology,
    telemetry,
    incidents,
    advisories,
    guidance,
    userPosition,
    isRouting,
    mode,
    setMode,
    connectionStatus,
    lastUpdatedAt,
    requestGuidance,
    setUserCoordinates,
  } = useFanStream(INITIAL_QUERY);

  const handleParamsChange = (next: RoutingQueryParams) => {
    setParams(next);
    void requestGuidance(next);
  };

  const handleQuickRouteNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    const targetNode = topology.nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;
    if (
      targetNode.type === "gate" ||
      targetNode.type === "concession" ||
      targetNode.type === "restroom" ||
      targetNode.type === "medical" ||
      targetNode.type === "seating_section"
    ) {
      handleParamsChange({
        ...params,
        target_type: targetNode.type,
        route_mode: targetNode.type === "gate" ? params.route_mode ?? "entry" : "facility",
        target_id: targetNode.id,
      });
    }
  };

  const handleQuickWaypoint = (
    wpMode: "entry" | "exit" | "concession" | "restroom" | "medical"
  ) => {
    if (wpMode === "entry" || wpMode === "exit") {
      handleParamsChange({
        ...params,
        target_type: "gate",
        route_mode: wpMode,
        target_id: undefined,
      });
    } else {
      handleParamsChange({
        ...params,
        target_type: wpMode,
        route_mode: "facility",
        target_id: undefined,
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

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        <AdvisoryBanner
          advisories={advisories}
          onQuickRouteNode={handleQuickRouteNode}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            Interactive M. Chinnaswamy Stadium Digital Twin — click any node or tap{" "}
            <strong className="text-cyan-300">Move My Location</strong> to reposition inside the stadium.
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
                  ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/50"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" />
              <span>2D Floor Map</span>
            </button>
          </div>
        </div>

        <WayfindingControls
          topology={topology}
          params={params}
          isRouting={isRouting}
          onChangeParams={handleParamsChange}
        />

        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          {viewMode === "3d" ? (
            <StadiumHologram3D
              topology={topology}
              telemetry={telemetry}
              incidents={incidents}
              guidance={guidance}
              userPosition={userPosition}
              selectedNodeId={selectedNodeId}
              heightClassName="h-[480px] sm:h-[560px]"
              onSelectNode={handleQuickRouteNode}
              onPlaceUser={(x, y, lvl) => void setUserCoordinates(x, y, lvl)}
              onQuickWaypoint={handleQuickWaypoint}
            />
          ) : (
            <WayfindingMap
              topology={topology}
              telemetry={telemetry}
              guidance={guidance}
            />
          )}

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
