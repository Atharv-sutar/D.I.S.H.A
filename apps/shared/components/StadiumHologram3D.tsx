"use client";

import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Compass,
  Crosshair,
  DoorOpen,
  Eye,
  Hand,
  Layers,
  LogOut,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  RotateCw,
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
  type CameraNavCommand,
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
  title = "M. Chinnaswamy Stadium • 3D Map",
  onSelectNode,
  onPlaceUser,
  onQuickWaypoint,
}: StadiumHologram3DProps) {
  const [layerFilter, setLayerFilter] = useState<HologramLayerFilter>("gates_only");
  const [placeUserMode, setPlaceUserMode] = useState(false);
  const [dragMode, setDragMode] = useState<"rotate" | "pan">("rotate");
  const [showLabels, setShowLabels] = useState(true);
  const [cameraRequest, setCameraRequest] = useState<CameraTargetSpec>({
    id: 0,
    preset: "aerial",
  });
  const [navCommand, setNavCommand] = useState<CameraNavCommand>({
    id: 0,
    type: "zoom_in",
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

  const triggerNav = (type: CameraNavCommand["type"]) => {
    setNavCommand((prev) => ({ id: prev.id + 1, type }));
  };

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Top Camera & View Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-slate-700" />
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <span className="hidden rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 md:inline-block">
            Drag: {dragMode === "pan" ? "Move Map" : "Rotate"} • Scroll: Zoom • Use + / - / Rotate buttons
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDragMode((m) => (m === "rotate" ? "pan" : "rotate"))}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
              dragMode === "pan"
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            title="Switch left-drag between Rotate and Move/Pan"
          >
            <Hand className="h-3 w-3" />
            <span>Drag: {dragMode === "pan" ? "Move (Pan)" : "Rotate"}</span>
          </button>

          {CAMERA_BUTTONS.map((btn) => {
            if (btn.id === "follow_me" && !userPosition && !seatLocation) return null;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => triggerCamera(btn.id)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {btn.id === "aerial" && <RotateCcw className="h-3 w-3 text-slate-600" />}
                {btn.id === "follow_me" && <Crosshair className="h-3 w-3 text-slate-600" />}
                {btn.id === "pitch_view" && <Eye className="h-3 w-3 text-slate-600" />}
                <span>{btn.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowLabels((s) => !s)}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
              showLabels
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Tag className="h-3 w-3" />
            <span>Labels</span>
          </button>

          {onPlaceUser && (
            <button
              type="button"
              onClick={() => setPlaceUserMode((m) => !m)}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
                placeUserMode
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <MapPin className="h-3 w-3" />
              <span>{placeUserMode ? "Click Map to Place Me" : "Set My Location"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter & Quick Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Layers className="mr-0.5 h-3.5 w-3.5 text-slate-500" />
          {LAYER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLayerFilter(tab.id)}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                layerFilter === tab.id
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {tab.id === "gates_only" && <DoorOpen className="h-3.5 w-3.5" />}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {onQuickWaypoint && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Navigation className="h-3.5 w-3.5 text-emerald-700" />
            <button
              type="button"
              onClick={() => onQuickWaypoint("exit")}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              <LogOut className="h-3.5 w-3.5" /> Best Exit (Low Crowd)
            </button>
            <button
              type="button"
              onClick={() => onQuickWaypoint("entry")}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Best Entry
            </button>
            <button
              type="button"
              onClick={() => onQuickWaypoint("concession")}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Food
            </button>
            <button
              type="button"
              onClick={() => onQuickWaypoint("restroom")}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Restroom
            </button>
          </div>
        )}
      </div>

      {/* 3D Canvas */}
      <div
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "=" || e.key === "+") triggerNav("zoom_in");
          else if (e.key === "-") triggerNav("zoom_out");
          else if (e.key === "q" || e.key === "ArrowLeft") triggerNav("rotate_left");
          else if (e.key === "e" || e.key === "ArrowRight") triggerNav("rotate_right");
          else if (e.key === "r") triggerCamera("aerial");
        }}
        className={`relative w-full bg-slate-200 focus:outline-none ${heightClassName}`}
      >
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
              dragMode={dragMode}
              cameraRequest={cameraRequest}
              navCommand={navCommand}
              showLabels={showLabels}
              onSelectNode={onSelectNode}
              onPlaceUser={(x, y, level) => {
                onPlaceUser?.(x, y, level);
                setPlaceUserMode(false);
              }}
            />
          </Suspense>
        </Canvas>

        {/* Top-Right On-Screen Navigation Pad (+, -, Rotate L/R) */}
        <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-md border border-slate-300 bg-white/95 p-1 shadow-sm">
          <button
            type="button"
            onClick={() => triggerNav("zoom_in")}
            title="Zoom In (+)"
            className="flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => triggerNav("zoom_out")}
            title="Zoom Out (-)"
            className="flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-slate-100"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="my-0.5 h-px bg-slate-200" />
          <button
            type="button"
            onClick={() => triggerNav("rotate_left")}
            title="Rotate Left (Q)"
            className="flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-slate-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => triggerNav("rotate_right")}
            title="Rotate Right (E)"
            className="flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-slate-100"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Bottom-Left Compact Legend */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2.5 rounded-md border border-slate-300 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Low Crowd / Exit
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Moderate
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Crowded / Alert
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> You
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Seat
          </span>
        </div>

        {/* Bottom-Right Selected Location Inspector */}
        {selectedNode && selectedTelem && selectedVisuals && (
          <div className="absolute bottom-3 right-3 w-64 rounded-md border border-slate-300 bg-white/95 p-3 text-xs shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{selectedNode.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Level {selectedNode.level} • {selectedNode.type.replace("_", " ")}
                  {selectedNode.gate_role
                    ? ` (${selectedNode.gate_role.replace("_", "/")})`
                    : ""}
                </p>
              </div>
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${selectedVisuals.bgClass} ${selectedVisuals.textClass} ${selectedVisuals.borderClass}`}
              >
                {selectedVisuals.label}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1">
                <p className="text-[10px] text-slate-500">Crowd</p>
                <p className="font-semibold text-slate-900">
                  {Math.round(selectedTelem.congestion_score * 100)}%
                </p>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1">
                <p className="text-[10px] text-slate-500">Wait</p>
                <p className="font-semibold text-slate-900">
                  {selectedTelem.estimated_wait_min}m
                </p>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1">
                <p className="text-[10px] text-slate-500">Queue</p>
                <p className="font-semibold text-slate-900">
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
