"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { Box, Map as MapIcon } from "lucide-react";
import { useFanStream } from "@shared/hooks/useFanStream";
import { useWalkSimulator } from "@shared/hooks/useWalkSimulator";
import {
  parseSeatTicket,
  type DetectedSeatLocation,
} from "@shared/lib/seatMapper";
import type { UserPosition3D, Waypoint3D } from "@shared/types/contracts";
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
      <div className="flex h-[500px] items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-xs font-medium text-slate-600">
        Loading M. Chinnaswamy 3D Map...
      </div>
    ),
  }
);

const INITIAL_QUERY: RoutingQueryParams = {
  origin: "transit_cubbon_park_metro",
  target_type: "seating_section",
  target_id: "stand_e_lower",
  route_mode: "facility",
  accessible: false,
};

export default function FanAppPage() {
  const [params, setParams] = useState<RoutingQueryParams>(INITIAL_QUERY);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    "stand_e_lower"
  );
  const [seatError, setSeatError] = useState<string | null>(null);
  const [seatedAtSeat, setSeatedAtSeat] = useState(false);

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
    setLiveUserPosition,
    setUserCoordinates,
  } = useFanStream(INITIAL_QUERY);

  const [detectedSeat, setDetectedSeat] = useState<DetectedSeatLocation | null>(
    () => parseSeatTicket("E-12-45", topology)
  );

  const handleParamsChange = useCallback(
    (next: RoutingQueryParams) => {
      setParams(next);
      void requestGuidance(next);
    },
    [requestGuidance]
  );

  const waypoints = useMemo(() => guidance?.waypoints_3d ?? [], [guidance]);

  const handleArrive = useCallback(
    (finalWp: Waypoint3D, pos: UserPosition3D) => {
      const arrivedAtSeat =
        detectedSeat !== null && finalWp.node_id === detectedSeat.standNodeId;

      if (arrivedAtSeat && detectedSeat) {
        setSeatedAtSeat(true);
        const seatPos: UserPosition3D = {
          x: detectedSeat.x,
          y: detectedSeat.y,
          z: detectedSeat.z,
          level: detectedSeat.level,
          heading_deg: pos.heading_deg ?? 0,
          snapped_node_id: detectedSeat.standNodeId,
        };
        setLiveUserPosition(seatPos);
        setParams((prev) => ({
          ...prev,
          origin: detectedSeat.standNodeId,
          user_x: detectedSeat.x,
          user_y: detectedSeat.y,
          user_z: detectedSeat.z,
          user_level: detectedSeat.level,
        }));
      } else {
        setLiveUserPosition(pos);
        setParams((prev) => ({
          ...prev,
          origin: finalWp.node_id,
          user_x: pos.x,
          user_y: pos.y,
          user_z: pos.z,
          user_level: pos.level,
        }));
      }
    },
    [detectedSeat, setLiveUserPosition]
  );

  const walkSim = useWalkSimulator({
    waypoints,
    onPositionTick: setLiveUserPosition,
    onArrive: handleArrive,
  });

  const handleDetectSeat = (rawSeat: string) => {
    const parsed = parseSeatTicket(rawSeat, topology);
    if (!parsed) {
      setSeatError(
        "Unrecognized seat format. Try e.g. E-12-45, F1-06-18, H-08-14, B-04-32, A-09-21, or P2-03-10."
      );
      return;
    }
    setSeatError(null);
    setDetectedSeat(parsed);
    setSelectedNodeId(parsed.standNodeId);
    setSeatedAtSeat(false);
    handleParamsChange({
      ...params,
      target_type: "seating_section",
      route_mode: "facility",
      target_id: parsed.standNodeId,
    });
  };

  const handleNavigateToSeat = () => {
    if (!detectedSeat) return;
    setSelectedNodeId(detectedSeat.standNodeId);
    handleParamsChange({
      ...params,
      target_type: "seating_section",
      route_mode: "facility",
      target_id: detectedSeat.standNodeId,
    });
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
        route_mode:
          targetNode.type === "gate"
            ? params.route_mode ?? "entry"
            : "facility",
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
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
          <p className="text-xs text-slate-600">
            M. Chinnaswamy Stadium Map — enter your seat ticket, walk to your seat, then navigate anywhere from your seat.
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
              <MapIcon className="h-3.5 w-3.5" />
              <span>2D Floor Map</span>
            </button>
          </div>
        </div>

        <WayfindingControls
          topology={topology}
          params={params}
          isRouting={isRouting}
          detectedSeat={detectedSeat}
          seatError={seatError}
          seatedAtSeat={seatedAtSeat}
          walkStatus={walkSim.status}
          walkProgress={walkSim.progress}
          walkSpeed={walkSim.speedMultiplier}
          activeWaypoint={walkSim.activeWaypoint}
          onChangeParams={handleParamsChange}
          onDetectSeat={handleDetectSeat}
          onNavigateToSeat={handleNavigateToSeat}
          onWalkStart={walkSim.startWalk}
          onWalkPause={walkSim.pauseWalk}
          onWalkReset={walkSim.resetWalk}
          onWalkSpeedChange={walkSim.setSpeedMultiplier}
        />

        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          {viewMode === "3d" ? (
            <StadiumHologram3D
              topology={topology}
              telemetry={telemetry}
              incidents={incidents}
              guidance={guidance}
              userPosition={userPosition}
              seatLocation={detectedSeat}
              selectedNodeId={selectedNodeId}
              heightClassName="h-[480px] sm:h-[560px]"
              onSelectNode={handleQuickRouteNode}
              onPlaceUser={(x, y, lvl) => {
                setSeatedAtSeat(false);
                void setUserCoordinates(x, y, lvl);
              }}
              onQuickWaypoint={handleQuickWaypoint}
            />
          ) : (
            <WayfindingMap
              topology={topology}
              telemetry={telemetry}
              guidance={guidance}
              userPosition={userPosition}
              onSelectNode={handleQuickRouteNode}
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
