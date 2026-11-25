"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ElementRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import type {
  AlertIncident,
  FanGuidanceResponse,
  NodeTelemetry,
  StadiumNode,
  StadiumTopology,
  StandSector,
  TelemetrySnapshot,
  UserPosition3D,
  Waypoint3D,
} from "../../types/contracts";
import type { DetectedSeatLocation } from "../../lib/seatMapper";
import { getCongestionVisuals } from "../../lib/congestion";

export type HologramLayerFilter =
  | "all"
  | "gates_only"
  | "amenities"
  | "route_only";

export type CameraPreset =
  | "aerial"
  | "follow_me"
  | "top_down"
  | "pitch_view";

export interface CameraTargetSpec {
  id: number;
  preset: CameraPreset;
}

interface HologramSceneContentProps {
  topology: StadiumTopology;
  telemetry: TelemetrySnapshot;
  incidents: AlertIncident[];
  guidance?: FanGuidanceResponse | null;
  userPosition?: UserPosition3D | null;
  seatLocation?: DetectedSeatLocation | null;
  activeFans?: UserPosition3D[];
  selectedNodeId?: string | null;
  layerFilter: HologramLayerFilter;
  placeUserMode: boolean;
  cameraRequest: CameraTargetSpec;
  showLabels: boolean;
  onSelectNode?: (nodeId: string) => void;
  onPlaceUser?: (x: number, y: number, level: number) => void;
}

export function toThree(x: number, y: number, z = 0): [number, number, number] {
  return [x, z, -y];
}

function buildRingPoints(
  radius: number,
  yHeight: number,
  segments = 96
): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, yHeight, -Math.sin(a) * radius]);
  }
  return pts;
}

function createStandSectorGeometry(sector: StandSector): THREE.ExtrudeGeometry {
  const startRad = (sector.start_deg * Math.PI) / 180;
  const endRad = (sector.end_deg * Math.PI) / 180;
  const shape = new THREE.Shape();
  const segments = 32;

  shape.moveTo(
    Math.cos(startRad) * sector.inner_radius_m,
    Math.sin(startRad) * sector.inner_radius_m
  );
  for (let i = 1; i <= segments; i++) {
    const a = startRad + ((endRad - startRad) * i) / segments;
    shape.lineTo(
      Math.cos(a) * sector.outer_radius_m,
      Math.sin(a) * sector.outer_radius_m
    );
  }
  for (let i = segments; i >= 0; i--) {
    const a = startRad + ((endRad - startRad) * i) / segments;
    shape.lineTo(
      Math.cos(a) * sector.inner_radius_m,
      Math.sin(a) * sector.inner_radius_m
    );
  }
  shape.closePath();

  return new THREE.ExtrudeGeometry(shape, {
    depth: sector.height_m,
    bevelEnabled: true,
    bevelThickness: 0.45,
    bevelSize: 0.45,
    bevelSegments: 2,
    curveSegments: 28,
  });
}

function StandTierBlock({
  sector,
  congestionScore,
  isSelected,
  isGatesOnly,
  onSelect,
}: {
  sector: StandSector;
  congestionScore: number;
  isSelected: boolean;
  isGatesOnly: boolean;
  onSelect?: (nodeId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const { extrudeGeom, edgesGeom } = useMemo(() => {
    const g = createStandSectorGeometry(sector);
    const e = new THREE.EdgesGeometry(g, 24);
    return { extrudeGeom: g, edgesGeom: e };
  }, [sector]);

  useEffect(() => {
    return () => {
      extrudeGeom.dispose();
      edgesGeom.dispose();
    };
  }, [extrudeGeom, edgesGeom]);

  // Subtle, refined architectural tinting instead of harsh neon blocks
  const tint =
    congestionScore >= 0.8
      ? "#ef4444"
      : congestionScore >= 0.6
        ? "#f97316"
        : congestionScore >= 0.35
          ? "#eab308"
          : "#0ea5e9";

  const baseOpacity = isGatesOnly
    ? 0.08
    : isSelected || hovered
      ? 0.46
      : 0.24;

  return (
    <group position={[0, sector.elevation_m, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh
        geometry={extrudeGeom}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(sector.linked_node_id);
        }}
      >
        <meshStandardMaterial
          color={tint}
          emissive={tint}
          emissiveIntensity={isSelected || hovered ? 0.55 : 0.18}
          roughness={0.45}
          metalness={0.35}
          transparent
          opacity={baseOpacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={edgesGeom}>
        <lineBasicMaterial
          color={isSelected || hovered ? "#e0f2fe" : tint}
          transparent
          opacity={isGatesOnly ? 0.16 : isSelected || hovered ? 0.85 : 0.42}
        />
      </lineSegments>
    </group>
  );
}

function FloodlightTower({
  x,
  y,
  heightM,
}: {
  x: number;
  y: number;
  heightM: number;
}) {
  const [tx, , tz] = toThree(x, y, 0);
  const angleToCenter = Math.atan2(-tx, -tz);

  return (
    <group position={[tx, 0, tz]} rotation={[0, angleToCenter, 0]}>
      <mesh position={[0, heightM / 2, 0]}>
        <cylinderGeometry args={[0.7, 1.8, heightM, 8]} />
        <meshStandardMaterial
          color="#1e293b"
          metalness={0.7}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, heightM + 1.8, 0.8]}>
        <boxGeometry args={[10, 4.4, 1.2]} />
        <meshStandardMaterial
          color="#e0f2fe"
          emissive="#7dd3fc"
          emissiveIntensity={1.25}
        />
      </mesh>
    </group>
  );
}

function GatePortalMarker({
  node,
  telemetry,
  isSelected,
  isOnRoute,
  showLabel,
  onSelect,
}: {
  node: StadiumNode;
  telemetry?: NodeTelemetry;
  isSelected: boolean;
  isOnRoute: boolean;
  showLabel: boolean;
  onSelect?: (nodeId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [nx, ny, nz] = toThree(node.x, node.y, node.z ?? 0);
  const score = telemetry?.congestion_score ?? 0.3;
  const visuals = getCongestionVisuals(telemetry?.status ?? "optimal");
  const isExitCapable =
    node.gate_role === "exit" || node.gate_role === "entry_exit";
  const gateColor = isSelected ? "#ffffff" : visuals.hex;
  const angleToCenter = Math.atan2(-nx, -nz);

  return (
    <group position={[nx, ny, nz]} rotation={[0, angleToCenter, 0]}>
      {/* Ground entry/exit pad */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.25, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(node.id);
        }}
      >
        <circleGeometry args={[5.5, 24]} />
        <meshStandardMaterial
          color={visuals.hex}
          emissive={visuals.hex}
          emissiveIntensity={isSelected || hovered ? 1.1 : 0.45}
          transparent
          opacity={0.4}
        />
      </mesh>

      {/* Architectural Gate Archway */}
      <mesh
        position={[0, 3.2, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(node.id);
        }}
      >
        <torusGeometry args={[4.6, 0.55, 10, 24, Math.PI]} />
        <meshStandardMaterial
          color={gateColor}
          emissive={isExitCapable ? "#10b981" : visuals.hex}
          emissiveIntensity={isSelected || hovered || isOnRoute ? 1.4 : 0.75}
        />
      </mesh>

      {/* Left & Right Gate Pillars */}
      <mesh position={[-4.6, 1.6, 0]}>
        <cylinderGeometry args={[0.45, 0.55, 3.2, 10]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[4.6, 1.6, 0]}>
        <cylinderGeometry args={[0.45, 0.55, 3.2, 10]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.3} />
      </mesh>

      {showLabel && (
        <Html center distanceFactor={210} position={[0, 9.5, 0]}>
          <div
            className={`pointer-events-none whitespace-nowrap rounded-lg border px-2 py-0.5 text-[10px] font-semibold shadow-lg backdrop-blur ${
              isSelected
                ? "border-white bg-slate-900/95 text-white"
                : score >= 0.7
                  ? "border-red-400/80 bg-red-950/90 text-red-100"
                  : isExitCapable
                    ? "border-emerald-400/75 bg-slate-950/90 text-emerald-200"
                    : "border-cyan-400/60 bg-slate-950/90 text-cyan-100"
            }`}
          >
            {node.stand_code ?? node.name.split(" (")[0]}
            {isExitCapable ? " • EXIT" : " • ENTRY"}
            {telemetry ? ` (${telemetry.estimated_wait_min}m)` : ""}
          </div>
        </Html>
      )}
    </group>
  );
}

function FacilityPodMarker({
  node,
  telemetry,
  isSelected,
  isOnRoute,
  showLabel,
  onSelect,
}: {
  node: StadiumNode;
  telemetry?: NodeTelemetry;
  isSelected: boolean;
  isOnRoute: boolean;
  showLabel: boolean;
  onSelect?: (nodeId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [nx, ny, nz] = toThree(node.x, node.y, node.z ?? 0);
  const visuals = getCongestionVisuals(telemetry?.status ?? "optimal");

  const accent =
    node.type === "medical"
      ? "#f43f5e"
      : node.type === "transit"
        ? "#38bdf8"
        : node.type === "restroom"
          ? "#60a5fa"
          : node.type === "concession"
            ? "#fb923c"
            : visuals.hex;

  const badgeTag =
    node.type === "concession"
      ? "FOOD"
      : node.type === "restroom"
        ? "WC"
        : node.type === "medical"
          ? "FIRST AID"
          : node.type === "transit"
            ? "METRO"
            : node.type === "seating_section"
              ? "STAND"
              : "ZONE";

  return (
    <group position={[nx, ny, nz]}>
      {/* Ground disc */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.28, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(node.id);
        }}
      >
        <ringGeometry args={[2.1, 3.8, 24]} />
        <meshBasicMaterial
          color={isSelected || hovered ? "#ffffff" : visuals.hex}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Compact Glowing Node Core */}
      <mesh
        position={[0, 1.6, 0]}
        scale={isSelected || hovered ? 1.25 : 1}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(node.id);
        }}
      >
        <cylinderGeometry args={[1.6, 2.0, 2.2, 16]} />
        <meshStandardMaterial
          color={accent}
          emissive={visuals.hex}
          emissiveIntensity={isSelected || hovered || isOnRoute ? 1.2 : 0.45}
          roughness={0.3}
        />
      </mesh>

      {showLabel && (isSelected || hovered || node.type === "transit" || isOnRoute) && (
        <Html center distanceFactor={215} position={[0, 5.2, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-slate-600/80 bg-slate-950/90 px-2 py-0.5 text-[9px] font-semibold text-slate-100 shadow">
            <span className="mr-1 text-cyan-300">{badgeTag}</span>
            {node.stand_code ?? node.name.split(" (")[0]}
            {telemetry ? ` • ${telemetry.estimated_wait_min}m` : ""}
          </div>
        </Html>
      )}
    </group>
  );
}

function UserLocationMarker({
  position,
  showLabel,
}: {
  position: UserPosition3D;
  showLabel: boolean;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const beaconRef = useRef<THREE.Group>(null);
  const [ux, uy, uz] = toThree(position.x, position.y, position.z);
  const headingRad = -((position.heading_deg ?? 0) * Math.PI) / 180;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      const s = 1 + (t % 1.6) * 0.85;
      ringRef.current.scale.set(s, s, 1);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0.08, 0.85 - (t % 1.6) * 0.5);
    }
    if (beaconRef.current) {
      beaconRef.current.position.y = uy + 5.0 + Math.sin(t * 3.0) * 0.6;
    }
  });

  return (
    <group>
      <mesh
        ref={ringRef}
        position={[ux, uy + 0.35, uz]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[3.2, 4.4, 32]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      <group position={[ux, uy + 0.6, uz]} rotation={[0, headingRad, 0]}>
        <mesh position={[0, 0, -5.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[3.2, 8.5, 3]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.55} />
        </mesh>
      </group>

      <group ref={beaconRef} position={[ux, uy + 5.0, uz]}>
        <mesh>
          <sphereGeometry args={[2.1, 16, 16]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#0ea5e9"
            emissiveIntensity={1.9}
          />
        </mesh>
        <mesh position={[0, -2.4, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 4.8, 12]} />
          <meshBasicMaterial color="#bae6fd" />
        </mesh>
        {showLabel && (
          <Html center distanceFactor={195} position={[0, 4.4, 0]}>
            <div className="pointer-events-none whitespace-nowrap rounded-full border border-sky-300 bg-sky-950/95 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-sky-100 shadow-lg">
              YOU • L{position.level}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

function SeatMarker3D({
  seat,
  showLabel,
}: {
  seat: DetectedSeatLocation;
  showLabel: boolean;
}) {
  const [sx, sy, sz] = toThree(seat.x, seat.y, seat.z);
  const pinRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (pinRef.current) {
      const t = clock.getElapsedTime();
      pinRef.current.rotation.y = t * 1.8;
      pinRef.current.position.y = 7.2 + Math.sin(t * 2.8) * 0.7;
    }
  });

  return (
    <group position={[sx, sy, sz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.35, 0]}>
        <ringGeometry args={[2.6, 4.2, 24]} />
        <meshBasicMaterial color="#fbbf24" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 3.6, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 7.2, 10]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
      <mesh ref={pinRef} position={[0, 7.2, 0]}>
        <octahedronGeometry args={[2.4, 0]} />
        <meshStandardMaterial
          color="#fef08a"
          emissive="#f59e0b"
          emissiveIntensity={1.8}
        />
      </mesh>
      {showLabel && (
        <Html center distanceFactor={195} position={[0, 11.5, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-lg border border-amber-300 bg-amber-950/95 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-100 shadow-lg">
            SEAT {seat.normalizedLabel}
          </div>
        </Html>
      )}
    </group>
  );
}

function WaypointTrail3D({
  waypoints,
  targetLabel,
  isExitRoute,
  showLabels,
}: {
  waypoints: Waypoint3D[];
  targetLabel?: string;
  isExitRoute: boolean;
  showLabels: boolean;
}) {
  const trailColor = isExitRoute ? "#10b981" : "#38bdf8";
  const particleRefs = useRef<(THREE.Mesh | null)[]>([]);
  const beaconSpinRef = useRef<THREE.Mesh>(null);

  const { curve, tubeGeom } = useMemo(() => {
    if (waypoints.length < 2) {
      return { curve: null, tubeGeom: null };
    }
    const pts = waypoints.map((w) => {
      const [x, y, z] = toThree(w.x, w.y, w.z + 2.2);
      return new THREE.Vector3(x, y, z);
    });
    const c = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.25);
    const tg = new THREE.TubeGeometry(c, Math.max(24, pts.length * 14), 1.05, 10, false);
    return { curve: c, tubeGeom: tg };
  }, [waypoints]);

  useEffect(() => {
    return () => {
      tubeGeom?.dispose();
    };
  }, [tubeGeom]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (curve) {
      const count = particleRefs.current.length;
      for (let i = 0; i < count; i++) {
        const mesh = particleRefs.current[i];
        if (!mesh) continue;
        const u = (t * 0.26 + i / count) % 1;
        mesh.position.copy(curve.getPointAt(u));
      }
    }
    if (beaconSpinRef.current) {
      beaconSpinRef.current.rotation.y = t * 1.8;
      beaconSpinRef.current.position.y = 12 + Math.sin(t * 2.8) * 1.0;
    }
  });

  if (waypoints.length === 0) return null;
  const dest = waypoints[waypoints.length - 1];
  const [dx, dy, dz] = toThree(dest.x, dest.y, dest.z);

  return (
    <group>
      {tubeGeom && (
        <mesh geometry={tubeGeom}>
          <meshStandardMaterial
            color={trailColor}
            emissive={trailColor}
            emissiveIntensity={1.3}
            transparent
            opacity={0.85}
          />
        </mesh>
      )}

      {curve &&
        [0, 1, 2, 3, 4].map((idx) => (
          <mesh
            key={`orb_${idx}`}
            ref={(el) => {
              particleRefs.current[idx] = el;
            }}
          >
            <sphereGeometry args={[1.65, 12, 12]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive={trailColor}
              emissiveIntensity={2.2}
            />
          </mesh>
        ))}

      {/* Destination Objective Pillar */}
      <group position={[dx, dy, dz]}>
        <mesh position={[0, 10, 0]}>
          <cylinderGeometry args={[1.0, 2.0, 20, 16, 1, true]} />
          <meshBasicMaterial
            color={trailColor}
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh ref={beaconSpinRef} position={[0, 12, 0]}>
          <octahedronGeometry args={[3.2, 0]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive={trailColor}
            emissiveIntensity={2.0}
          />
        </mesh>
        {showLabels && (
          <Html center distanceFactor={195} position={[0, 20, 0]}>
            <div
              className={`pointer-events-none whitespace-nowrap rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-lg ${
                isExitRoute
                  ? "border-emerald-300 bg-emerald-950/95 text-emerald-100"
                  : "border-sky-300 bg-slate-950/95 text-sky-100"
              }`}
            >
              {isExitRoute ? "BEST EXIT" : "DESTINATION"}:{" "}
              {targetLabel ?? dest.node_id}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

function IncidentBeacon3D({
  incident,
  onSelect,
  showLabel,
}: {
  incident: AlertIncident;
  onSelect?: (nodeId: string) => void;
  showLabel: boolean;
}) {
  const diamondRef = useRef<THREE.Mesh>(null);
  const pos = incident.position ?? { x: 0, y: 0, z: 4, level: 1 };
  const [ix, iy, iz] = toThree(pos.x, pos.y, pos.z);
  const color =
    incident.severity === "critical"
      ? "#ef4444"
      : incident.severity === "high"
        ? "#f97316"
        : "#f59e0b";

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (diamondRef.current) {
      diamondRef.current.rotation.y = t * 2.2;
      diamondRef.current.position.y = 11 + Math.sin(t * 3.5) * 0.8;
    }
  });

  return (
    <group position={[ix, iy, iz]}>
      <mesh
        ref={diamondRef}
        position={[0, 11, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(incident.node_id);
        }}
      >
        <octahedronGeometry args={[2.8, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.8}
        />
      </mesh>
      {showLabel && (
        <Html center distanceFactor={215} position={[0, 15.5, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded border border-red-400/80 bg-red-950/95 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-100 shadow">
            ALERT • {incident.category.replace("_", " ")}
          </div>
        </Html>
      )}
    </group>
  );
}

function CameraRig({
  cameraRequest,
  userPosition,
  seatLocation,
}: {
  cameraRequest: CameraTargetSpec;
  userPosition?: UserPosition3D | null;
  seatLocation?: DetectedSeatLocation | null;
}) {
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const animatingRef = useRef(false);
  const goalPosRef = useRef(new THREE.Vector3(0, 165, 225));
  const goalTargetRef = useRef(new THREE.Vector3(0, 6, 0));
  const userPosRef = useRef(userPosition);
  const seatRef = useRef(seatLocation);

  userPosRef.current = userPosition;
  seatRef.current = seatLocation;

  useEffect(() => {
    if (cameraRequest.id === 0) return;
    const preset = cameraRequest.preset;
    if (preset === "aerial") {
      goalPosRef.current.set(0, 165, 225);
      goalTargetRef.current.set(0, 6, 0);
    } else if (preset === "top_down") {
      goalPosRef.current.set(0, 280, 18);
      goalTargetRef.current.set(0, 0, 0);
    } else if (preset === "pitch_view") {
      goalPosRef.current.set(0, 16, 48);
      goalTargetRef.current.set(0, 14, -85);
    } else if (preset === "follow_me") {
      const targetPos = userPosRef.current ?? seatRef.current;
      if (targetPos) {
        const [ux, uy, uz] = toThree(targetPos.x, targetPos.y, targetPos.z);
        goalTargetRef.current.set(ux, uy + 4, uz);
        goalPosRef.current.set(ux + 52, uy + 55, uz + 62);
      }
    }
    animatingRef.current = true;
  }, [cameraRequest.id, cameraRequest.preset]);

  useFrame((_, delta) => {
    if (!animatingRef.current || !controlsRef.current) return;
    const alpha = Math.min(1, delta * 5.0);
    camera.position.lerp(goalPosRef.current, alpha);
    controlsRef.current.target.lerp(goalTargetRef.current, alpha);
    controlsRef.current.update();
    if (
      camera.position.distanceTo(goalPosRef.current) < 1.2 &&
      controlsRef.current.target.distanceTo(goalTargetRef.current) < 1.2
    ) {
      animatingRef.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enableZoom
      enablePan
      enableRotate
      minDistance={35}
      maxDistance={430}
      maxPolarAngle={Math.PI * 0.485}
      onStart={() => {
        animatingRef.current = false;
      }}
    />
  );
}

export function HologramSceneContent({
  topology,
  telemetry,
  incidents,
  guidance,
  userPosition,
  seatLocation,
  activeFans = [],
  selectedNodeId,
  layerFilter,
  placeUserMode,
  cameraRequest,
  showLabels,
  onSelectNode,
  onPlaceUser,
}: HologramSceneContentProps) {
  const nodeMap = useMemo(
    () => new Map<string, StadiumNode>(topology.nodes.map((n) => [n.id, n])),
    [topology.nodes]
  );
  const telemetryMap = useMemo(
    () =>
      new Map<string, NodeTelemetry>(
        telemetry.nodes.map((n) => [n.node_id, n])
      ),
    [telemetry.nodes]
  );
  const routeSet = useMemo(
    () => new Set(guidance?.route_node_ids ?? []),
    [guidance?.route_node_ids]
  );

  const spec = topology.hologram_spec;
  const fieldRadius = spec?.field_radius_m ?? 68;
  const boundaryPts = useMemo(() => buildRingPoints(fieldRadius, 0.35), [fieldRadius]);
  const innerCirclePts = useMemo(() => buildRingPoints(27.4, 0.38, 64), []);
  const concourseRingPts = useMemo(() => buildRingPoints(102, 0.25), []);
  const plazaRingPts = useMemo(() => buildRingPoints(136, 0.2), []);
  const canopyInner = useMemo(
    () =>
      buildRingPoints(
        spec?.canopy_ring?.inner_radius_m ?? 94,
        spec?.canopy_ring?.elevation_m ?? 26
      ),
    [spec]
  );
  const canopyOuter = useMemo(
    () =>
      buildRingPoints(
        spec?.canopy_ring?.outer_radius_m ?? 132,
        spec?.canopy_ring?.elevation_m ?? 26
      ),
    [spec]
  );

  const canopyStruts = useMemo(() => {
    const innerR = spec?.canopy_ring?.inner_radius_m ?? 94;
    const outerR = spec?.canopy_ring?.outer_radius_m ?? 132;
    const elev = spec?.canopy_ring?.elevation_m ?? 26;
    const struts: [[number, number, number], [number, number, number]][] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      struts.push([
        [Math.cos(a) * innerR, elev, -Math.sin(a) * innerR],
        [Math.cos(a) * outerR, elev, -Math.sin(a) * outerR],
      ]);
    }
    return struts;
  }, [spec]);

  const activeIncidents = useMemo(
    () => incidents.filter((i) => i.status !== "resolved"),
    [incidents]
  );

  const handleFloorClick = (e: ThreeEvent<MouseEvent>) => {
    if (!placeUserMode || !onPlaceUser) return;
    e.stopPropagation();
    const wx = e.point.x;
    const wy = -e.point.z;
    const radius = Math.hypot(wx, wy);
    const inferredLevel = radius > 103 ? 0 : radius > 72 ? 1 : 0;
    onPlaceUser(wx, wy, inferredLevel);
  };

  const isExitRoute =
    guidance?.target_beacon?.node_id !== undefined &&
    nodeMap.get(guidance.target_beacon.node_id)?.type === "gate" &&
    guidance.steps.some((s) => s.instruction.toLowerCase().includes("exit"));

  return (
    <>
      <color attach="background" args={["#060d1b"]} />
      <fog attach="fog" args={["#060d1b", 260, 560]} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[90, 180, 120]} intensity={1.1} color="#e0f2fe" />
      <pointLight position={[0, 90, 0]} intensity={1.2} color="#38bdf8" />

      <CameraRig
        cameraRequest={cameraRequest}
        userPosition={userPosition}
        seatLocation={seatLocation}
      />

      {/* Stadium Architectural Plinth & Ground */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onClick={handleFloorClick}
      >
        <circleGeometry args={[175, 72]} />
        <meshStandardMaterial color="#0b1528" roughness={0.85} metalness={0.15} />
      </mesh>
      <Line points={concourseRingPts} color="#1e3a5f" lineWidth={1.2} />
      <Line points={plazaRingPts} color="#1e293b" lineWidth={1.2} />

      {/* Cricket Outfield & Pitch */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
        <circleGeometry args={[fieldRadius, 72]} />
        <meshStandardMaterial color="#09382b" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <circleGeometry args={[46, 64]} />
        <meshStandardMaterial color="#0b4636" roughness={0.9} />
      </mesh>
      <Line points={boundaryPts} color="#34d399" lineWidth={2} />
      <Line points={innerCirclePts} color="#6ee7b7" lineWidth={1} transparent opacity={0.55} />

      {/* Central Cricket Pitch Strip */}
      <mesh position={[0, 0.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.1, spec?.pitch_length_m ?? 20.12]} />
        <meshStandardMaterial color="#d6c29b" roughness={0.9} />
      </mesh>

      {showLabels && spec?.ends && (
        <>
          <Html center distanceFactor={235} position={[0, 3, -52]}>
            <div className="pointer-events-none whitespace-nowrap rounded bg-slate-950/80 px-2 py-0.5 text-[9px] font-medium text-emerald-200/90">
              {spec.ends.north_end}
            </div>
          </Html>
          <Html center distanceFactor={235} position={[0, 3, 52]}>
            <div className="pointer-events-none whitespace-nowrap rounded bg-slate-950/80 px-2 py-0.5 text-[9px] font-medium text-emerald-200/90">
              {spec.ends.south_end}
            </div>
          </Html>
        </>
      )}

      {showLabels &&
        spec?.perimeter_roads?.map((road) => {
          const [rx, , rz] = toThree(road.label_x, road.label_y, 0);
          return (
            <Html key={road.name} center distanceFactor={265} position={[rx, 2, rz]}>
              <div className="pointer-events-none whitespace-nowrap rounded border border-slate-700/70 bg-slate-900/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-300">
                {road.name}
              </div>
            </Html>
          );
        })}

      {/* 3D Architectural Seating Stand Sectors */}
      {spec?.stand_sectors?.map((sector) => {
        const score = telemetryMap.get(sector.linked_node_id)?.congestion_score ?? 0.3;
        return (
          <StandTierBlock
            key={sector.id}
            sector={sector}
            congestionScore={score}
            isSelected={selectedNodeId === sector.linked_node_id}
            isGatesOnly={layerFilter === "gates_only" || layerFilter === "route_only"}
            onSelect={onSelectNode}
          />
        );
      })}

      {/* Sleek Solar Canopy Ring */}
      <mesh position={[0, spec?.canopy_ring?.elevation_m ?? 26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[
            spec?.canopy_ring?.inner_radius_m ?? 94,
            spec?.canopy_ring?.outer_radius_m ?? 132,
            72,
          ]}
        />
        <meshStandardMaterial
          color="#0c4a6e"
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Line points={canopyInner} color="#38bdf8" lineWidth={1.5} transparent opacity={0.55} />
      <Line points={canopyOuter} color="#0ea5e9" lineWidth={1.5} transparent opacity={0.45} />
      {canopyStruts.map((pair, idx) => (
        <Line
          key={`strut_${idx}`}
          points={pair}
          color="#0284c7"
          lineWidth={1}
          transparent
          opacity={0.25}
        />
      ))}

      {/* 4 Floodlight Towers */}
      {spec?.floodlight_towers?.map((tower) => (
        <FloodlightTower
          key={tower.id}
          x={tower.x}
          y={tower.y}
          heightM={tower.height_m}
        />
      ))}

      {/* Walkable Concourse Pathways (subtle) */}
      {layerFilter !== "gates_only" &&
        topology.edges.map((edge) => {
          const from = nodeMap.get(edge.from_node);
          const to = nodeMap.get(edge.to_node);
          if (!from || !to) return null;
          return (
            <Line
              key={edge.id}
              points={[
                toThree(from.x, from.y, (from.z ?? 0) + 0.35),
                toThree(to.x, to.y, (to.z ?? 0) + 0.35),
              ]}
              color={edge.accessible === false ? "#8b5cf6" : "#1e3a5f"}
              lineWidth={1}
              transparent
              opacity={0.45}
            />
          );
        })}

      {/* Stadium Nodes: Architectural Gate Portals & Clean Facility Pods */}
      {topology.nodes.map((node) => {
        const telem = telemetryMap.get(node.id);
        const isGate = node.type === "gate";
        const isAmenity =
          node.type === "concession" ||
          node.type === "restroom" ||
          node.type === "medical";
        const onRoute = routeSet.has(node.id);

        if (layerFilter === "gates_only" && !isGate && node.type !== "transit") {
          return null;
        }
        if (layerFilter === "amenities" && !isAmenity && !isGate) {
          return null;
        }
        if (layerFilter === "route_only" && !onRoute) {
          return null;
        }

        if (isGate) {
          return (
            <GatePortalMarker
              key={node.id}
              node={node}
              telemetry={telem}
              isSelected={selectedNodeId === node.id}
              isOnRoute={onRoute}
              showLabel={showLabels}
              onSelect={onSelectNode}
            />
          );
        }

        return (
          <FacilityPodMarker
            key={node.id}
            node={node}
            telemetry={telem}
            isSelected={selectedNodeId === node.id}
            isOnRoute={onRoute}
            showLabel={showLabels}
            onSelect={onSelectNode}
          />
        );
      })}

      {/* Active Incident Beacons */}
      {layerFilter !== "gates_only" &&
        activeIncidents.map((inc) => (
          <IncidentBeacon3D
            key={inc.incident_id}
            incident={inc}
            onSelect={onSelectNode}
            showLabel={showLabels}
          />
        ))}

      {/* Active Tracked Fans (Ops View) */}
      {activeFans.map((fan, idx) => {
        const [fx, fy, fz] = toThree(fan.x, fan.y, fan.z);
        return (
          <mesh key={`fan_${fan.snapped_node_id}_${idx}`} position={[fx, fy + 2.0, fz]}>
            <sphereGeometry args={[1.35, 10, 10]} />
            <meshStandardMaterial
              color="#7dd3fc"
              emissive="#0ea5e9"
              emissiveIntensity={1.4}
            />
          </mesh>
        );
      })}

      {/* Detected Seat Marker */}
      {seatLocation && (
        <SeatMarker3D seat={seatLocation} showLabel={showLabels} />
      )}

      {/* User Location Marker */}
      {userPosition && (
        <UserLocationMarker position={userPosition} showLabel={showLabels} />
      )}

      {/* Animated Waypoints */}
      {guidance && guidance.waypoints_3d.length > 0 && (
        <WaypointTrail3D
          waypoints={guidance.waypoints_3d}
          targetLabel={guidance.target_beacon?.label}
          isExitRoute={Boolean(isExitRoute)}
          showLabels={showLabels}
        />
      )}
    </>
  );
}
