"use client";

import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Compass,
  Crosshair,
  DoorOpen,
  Eye,
  Layers,
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
  activeFans?: UserPosition3D[];
  selectedNodeId?: string | null;
  heightClassName?: string;
  title?: string;
  onSelectNode?: (nodeId: string) => void;
  onPlaceUser?: (x: number, y: number, level: number) => void;
  onQuickWaypoint?: (mode: "entry" | "exit" | "concession" | "restroom" | "medical") => void;
}

const LAYER_TABS: { id: HologramLayerFilter; label: string }[] = [
  { id: "all", label: "All Layers" },
  { id: "congestion", label: "Congestion" },
  { id: "exits", label: "Exits & Gates" },
  { id: "waypoints", label: "Waypoints" },
  { id: "amenities", label: "Food / WC / Med" },
];

const CAMERA_BUTTONS: { id: CameraPreset; label: string }[] = [
  { id: "aerial", label: "Aerial" },
  { id: "follow_me", label: "My Location" },
  { id: "top_down", label: "Top-Down" },
  { id: "pitch_view", label: "Pitch View" },
  { id: "exits", label: "Exits View" },
];

export function StadiumHologram3D({
  topology,
  telemetry,
  incidents,
  guidance,
  userPosition,
  activeFans,
  selectedNodeId,
  heightClassName = "h-[460px] sm:h-[540px]",
  title = "M. Chinnaswamy Stadium • 3D Hologram Digital Twin",
  onSelectNode,
  onPlaceUser,
  onQuickWaypoint,
}: StadiumHologram3DProps) {
  const [layerFilter, setLayerFilter] = useState<HologramLayerFilter>("all");
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
    <section className="overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#030816] shadow-[0_0_32px_rgba(6,182,212,0.12)]">
      {/* Top Hologram Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/20 bg-slate-950/90 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-cyan-50">{title}</h2>
          <span className="hidden rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300 sm:inline-block">
            Drag: Look Around • Scroll: Zoom • Right-Drag: Move
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CAMERA_BUTTONS.map((btn) => {
            if (btn.id === "follow_me" && !userPosition) return null;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => triggerCamera(btn.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-500/15"
              >
                {btn.id === "aerial" && <RotateCcw className="h-3 w-3" />}
                {btn.id === "follow_me" && <Crosshair className="h-3 w-3" />}
                {btn.id === "exits" && <DoorOpen className="h-3 w-3" />}
                {btn.id === "pitch_view" && <Eye className="h-3 w-3" />}
                <span>{btn.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowLabels((s) => !s)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
              showLabels
                ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                : "border-slate-700 bg-slate-900 text-slate-400"
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
                  ? "border-emerald-400 bg-emerald-500/25 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/50"
              }`}
            >
              <MapPin className="h-3 w-3" />
              <span>{placeUserMode ? "Tap Floor to Place Me" : "Move My Location"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter & Waypoint Quick Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/15 bg-slate-950/75 px-4 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <Layers className="mr-1 h-3.5 w-3.5 text-cyan-400" />
          {LAYER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLayerFilter(tab.id)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                layerFilter === tab.id
                  ? "bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/60"
                  : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {onQuickWaypoint && (
          <div className="flex flex-wrap items-center gap-1">
            <Navigation className="mr-0.5 h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[11px] font-medium text-slate-400">
              Waypoints:
            </span>
            {(
              [
                { id: "entry", label: "Entry" },
                { id: "exit", label: "Exit" },
                { id: "concession", label: "Food" },
                { id: "restroom", label: "Restroom" },
                { id: "medical", label: "Medical" },
              ] as const
            ).map((wp) => (
              <button
                key={wp.id}
                type="button"
                onClick={() => onQuickWaypoint(wp.id)}
                className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
              >
                {wp.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3D WebGL Canvas */}
      <div className={`relative w-full ${heightClassName}`}>
        <Canvas
          camera={{ position: [0, 155, 225], fov: 46, near: 1, far: 1200 }}
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

        {/* Bottom-Left Hologram Legend */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2 rounded-xl border border-cyan-500/25 bg-slate-950/80 px-3 py-1.5 text-[10px] text-slate-200 backdrop-blur">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-cyan-400" /> You / Optimal
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Moderate
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Critical / Alert
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Exit / Waypoint
          </span>
        </div>

        {/* Bottom-Right Selected Node Telemetry Card */}
        {selectedNode && selectedTelem && selectedVisuals && (
          <div className="absolute bottom-3 right-3 w-64 rounded-xl border border-cyan-500/35 bg-slate-950/90 p-3 text-xs backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-white">{selectedNode.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-cyan-300">
                  Level {selectedNode.level} • {selectedNode.type.replace("_", " ")}
                  {selectedNode.gate_role ? ` (${selectedNode.gate_role.replace("_", "/")})` : ""}
                </p>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${selectedVisuals.bgClass} ${selectedVisuals.textClass} ${selectedVisuals.borderClass}`}
              >
                {selectedVisuals.label}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded bg-slate-900/90 px-1.5 py-1">
                <p className="text-[10px] text-slate-400">Congestion</p>
                <p className="font-semibold text-white">
                  {Math.round(selectedTelem.congestion_score * 100)}%
                </p>
              </div>
              <div className="rounded bg-slate-900/90 px-1.5 py-1">
                <p className="text-[10px] text-slate-400">Wait</p>
                <p className="font-semibold text-white">
                  {selectedTelem.estimated_wait_min}m
                </p>
              </div>
              <div className="rounded bg-slate-900/90 px-1.5 py-1">
                <p className="text-[10px] text-slate-400">Queue</p>
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
