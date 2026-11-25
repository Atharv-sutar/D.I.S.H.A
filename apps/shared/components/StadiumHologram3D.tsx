"use client";

import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Compass,
  Crosshair,
  DoorOpen,
  Eye,
  Layers,
  LogOut,
  MapPin,
  Navigation,
  RotateCcw,
  Tag,
} from "lucide-react";
import type {
  AlertIncident,
  FanGuidanceResponse,
  StadiumNode,
  StadiumTopology,
  TelemetrySnapshot,
  UserPosition3D,
} from "../types/contracts";
import { getCongestionVisuals } from "../lib/congestion";
import type { DetectedSeatLocation } from "../lib/seatMapper";
import {
  HologramSceneContent,
  type CameraPreset,
  type CameraTargetSpec,
  type HologramLayerFilter,
} from "./hologram/HologramSceneContent";

export interface StadiumHologram3DProps {
  topology: StadiumTopology;
  telemetry: TelemetrySnapshot;
  incidents: AlertIncident[];
  guidance?: FanGuidanceResponse | null;
  userPosition?: UserPosition3D | null;
  seatLocation?: DetectedSeatLocation | null;
  activeFans?: UserPosition3D[];
  selectedNodeId?: string | null;
  heightClassName?: string;
  title?: string;
  onSelectNode?: (nodeId: string) => void;
  onPlaceUser?: (x: number, y: number, level: number) => void;
  onQuickWaypoint?: (
    mode: "entry" | "exit" | "concession" | "restroom" | "medical"
  ) => void;
}

const LAYER_TABS: { id: HologramLayerFilter; label: string }[] = [
  { id: "gates_only", label: "Gates & Exits" },
  { id: "route_only", label: "Route Focus" },
  { id: "amenities", label: "Food / WC / Aid" },
  { id: "all", label: "All Zones" },
];

const CAMERA_BUTTONS: { id: CameraPreset; label: string }[] = [
  { id: "aerial", label: "Reset View" },
  { id: "follow_me", label: "My Location" },
  { id: "top_down", label: "Top View" },
  { id: "pitch_view", label: "Inside Bowl" },
];

export function StadiumHologram3D({
  topology,
  telemetry,
  incidents,
  guidance,
  userPosition,
  seatLocation,
  activeFans,
  selectedNodeId,
  heightClassName = "h-[480px] sm:h-[560px]",
  title = "M. Chinnaswamy Stadium • 3D Interactive Map",
  onSelectNode,
  onPlaceUser,
  onQuickWaypoint,
}: StadiumHologram3DProps) {
  const [layerFilter, setLayerFilter] = useState<HologramLayerFilter>("gates_only");
  const [placeUserMode, setPlaceUserMode] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [cameraRequest, setCameraRequest] = useState<CameraTargetSpec>({
    id: 0,
    preset: "aerial",
  });

  const nodeMap = useMemo(
    () => new Map<string, StadiumNode>(topology.nodes.map((n) => [n.id, n])),
    [topology.nodes]
  );
  const telemetryMap = useMemo(
    () => new Map(telemetry.nodes.map((n) => [n.node_id, n])),
    [telemetry.nodes]
  );

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
  const selectedTelem = selectedNodeId ? telemetryMap.get(selectedNodeId) : null;
  const selectedVisuals = selectedTelem
    ? getCongestionVisuals(selectedTelem.status)
    : null;

  const triggerCamera = (preset: CameraPreset) => {
    setCameraRequest((prev) => ({ id: prev.id + 1, preset }));
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#09090b] shadow-2xl">
      {/* Top Camera & View Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <span className="hidden rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300 md:inline-block">
            Drag: Look Around • Scroll: Zoom • Right-Drag: Pan
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CAMERA_BUTTONS.map((btn) => {
            if (btn.id === "follow_me" && !userPosition && !seatLocation) return null;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => triggerCamera(btn.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition hover:border-amber-400 hover:bg-amber-500/15"
              >
                {btn.id === "aerial" && <RotateCcw className="h-3 w-3 text-amber-400" />}
                {btn.id === "follow_me" && <Crosshair className="h-3 w-3 text-amber-400" />}
                {btn.id === "pitch_view" && <Eye className="h-3 w-3 text-amber-400" />}
                <span>{btn.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowLabels((s) => !s)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
              showLabels
                ? "border-amber-500/60 bg-amber-500/15 text-amber-100"
                : "border-zinc-700 bg-zinc-900 text-zinc-400"
            }`}
          >
            <Tag className="h-3 w-3" />
            <span>Labels</span>
          </button>

          {onPlaceUser && (
            <button
              type="button"
              onClick={() => setPlaceUserMode((m) => !m)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                placeUserMode
                  ? "border-emerald-400 bg-emerald-500/25 text-emerald-100"
                  : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-amber-400"
              }`}
            >
              <MapPin className="h-3 w-3" />
              <span>{placeUserMode ? "Click Map to Place Me" : "Set My Location"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter & Quick Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/90 px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Layers className="mr-0.5 h-3.5 w-3.5 text-rose-400" />
          {LAYER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLayerFilter(tab.id)}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                layerFilter === tab.id
                  ? "bg-rose-600 text-white font-semibold shadow-sm"
                  : "bg-zinc-950/75 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {tab.id === "gates_only" && <DoorOpen className="h-3.5 w-3.5" />}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {onQuickWaypoint && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Navigation className="h-3.5 w-3.5 text-emerald-400" />
            <button
              type="button"
              onClick={() => onQuickWaypoint("exit")}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400"
            >
              <LogOut className="h-3.5 w-3.5" /> Best Exit (Low Crowd)
            </button>
            <button
              type="button"
              onClick={() => onQuickWaypoint("entry")}
              className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
            >
              Best Entry
            </button>
            <button
              type="button"
              onClick={() => onQuickWaypoint("concession")}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:border-zinc-500"
            >
              Food
            </button>
            <button
              type="button"
              onClick={() => onQuickWaypoint("restroom")}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:border-zinc-500"
            >
              Restroom
            </button>
          </div>
        )}
      </div>

      {/* 3D Canvas */}
      <div className={`relative w-full ${heightClassName}`}>
        <Canvas
          camera={{ position: [0, 165, 225], fov: 45, near: 1, far: 1200 }}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <Suspense fallback={null}>
            <HologramSceneContent
              topology={topology}
              telemetry={telemetry}
              incidents={incidents}
              guidance={guidance}
              userPosition={userPosition}
              seatLocation={seatLocation}
              activeFans={activeFans}
              selectedNodeId={selectedNodeId}
              layerFilter={layerFilter}
              placeUserMode={placeUserMode}
              cameraRequest={cameraRequest}
              showLabels={showLabels}
              onSelectNode={onSelectNode}
              onPlaceUser={(x, y, level) => {
                onPlaceUser?.(x, y, level);
                setPlaceUserMode(false);
              }}
            />
          </Suspense>
        </Canvas>

        {/* Bottom-Left Compact Legend */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2.5 rounded-xl border border-zinc-700/80 bg-zinc-950/85 px-3 py-1.5 text-[10px] text-zinc-200 backdrop-blur">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Low Crowd / Exit
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Moderate
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Crowded / Alert
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-400" /> You
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-300" /> Seat
          </span>
        </div>

        {/* Bottom-Right Selected Location Inspector */}
        {selectedNode && selectedTelem && selectedVisuals && (
          <div className="absolute bottom-3 right-3 w-64 rounded-xl border border-zinc-700 bg-zinc-950/92 p-3 text-xs shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-white">{selectedNode.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-amber-300">
                  Level {selectedNode.level} • {selectedNode.type.replace("_", " ")}
                  {selectedNode.gate_role
                    ? ` (${selectedNode.gate_role.replace("_", "/")})`
                    : ""}
                </p>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${selectedVisuals.bgClass} ${selectedVisuals.textClass} ${selectedVisuals.borderClass}`}
              >
                {selectedVisuals.label}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded bg-zinc-900 px-1.5 py-1">
                <p className="text-[10px] text-zinc-400">Crowd</p>
                <p className="font-semibold text-white">
                  {Math.round(selectedTelem.congestion_score * 100)}%
                </p>
              </div>
              <div className="rounded bg-zinc-900 px-1.5 py-1">
                <p className="text-[10px] text-zinc-400">Wait</p>
                <p className="font-semibold text-white">
                  {selectedTelem.estimated_wait_min}m
                </p>
              </div>
              <div className="rounded bg-zinc-900 px-1.5 py-1">
                <p className="text-[10px] text-zinc-400">Queue</p>
                <p className="font-semibold text-white">
                  {selectedTelem.queue_length}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
