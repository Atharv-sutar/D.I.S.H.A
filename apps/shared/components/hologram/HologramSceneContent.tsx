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
import { buildDetailedStadiumPath } from "../../lib/routeGeometry";

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

export interface CameraNavCommand {
  id: number;
  type: "zoom_in" | "zoom_out" | "rotate_left" | "rotate_right";
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
  dragMode: "rotate" | "pan";
  cameraRequest: CameraTargetSpec;
  navCommand: CameraNavCommand;
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

function createArcExtrudeGeometry(
  startDeg: number,
  endDeg: number,
  innerR: number,
  outerR: number,
  height: number,
  segments = 24
): THREE.ExtrudeGeometry {
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const shape = new THREE.Shape();

  shape.moveTo(Math.cos(startRad) * innerR, Math.sin(startRad) * innerR);
  for (let i = 1; i <= segments; i++) {
    const a = startRad + ((endRad - startRad) * i) / segments;
    shape.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
  }
  for (let i = segments; i >= 0; i--) {
    const a = startRad + ((endRad - startRad) * i) / segments;
    shape.lineTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
  }
  shape.closePath();

  return new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.25,
    bevelSize: 0.25,
    bevelSegments: 1,
    curveSegments: 22,
  });
}

function getSeatingHeatColor(score: number, level: number): string {
  if (score >= 0.8) return "#dc2626"; // Critical red
  if (score >= 0.6) return "#ea580c"; // High orange
  if (score >= 0.35) return "#d97706"; // Moderate amber
  return level >= 2 ? "#16a34a" : "#10b981"; // Optimal / no congestion green
}

function SteppedStandSector({
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

  const stepCount = 5;
  const stepGeometries = useMemo(() => {
    const radialSpan = sector.outer_radius_m - sector.inner_radius_m;
    const radialStep = radialSpan / stepCount;
    const heightStep = sector.height_m / stepCount;

    return Array.from({ length: stepCount }, (_, idx) => {
      const rIn = sector.inner_radius_m + idx * radialStep;
      const rOut = sector.inner_radius_m + (idx + 1) * radialStep + 0.35;
      const h = (idx + 1) * heightStep;
      return {
        idx,
        geometry: createArcExtrudeGeometry(
          sector.start_deg,
          sector.end_deg,
          rIn,
          rOut,
          h,
          24
        ),
      };
    });
  }, [sector]);

  const fasciaGeometry = useMemo(
    () =>
      createArcExtrudeGeometry(
        sector.start_deg,
        sector.end_deg,
        sector.inner_radius_m - 0.6,
        sector.inner_radius_m + 0.5,
        1.1,
        24
      ),
    [sector]
  );

  const radialRibs = useMemo(() => {
    const ribs: { x: number; z: number; angleRad: number }[] = [];
    const divCount = 3;
    for (let i = 1; i < divCount; i++) {
      const deg =
        sector.start_deg + ((sector.end_deg - sector.start_deg) * i) / divCount;
      const rad = (deg * Math.PI) / 180;
      const midR = (sector.inner_radius_m + sector.outer_radius_m) * 0.5;
      ribs.push({
        x: Math.cos(rad) * midR,
        z: -Math.sin(rad) * midR,
        angleRad: rad,
      });
    }
    return ribs;
  }, [sector]);

  const seatColor = getSeatingHeatColor(congestionScore, sector.level);
  const concreteColor = sector.level >= 2 ? "#cbd5e1" : "#94a3b8";
  const radialLen = sector.outer_radius_m - sector.inner_radius_m;

  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(sector.linked_node_id);
      }}
    >
      {/* Front concrete/LED fascia */}
      <mesh
        geometry={fasciaGeometry}
        position={[0, sector.elevation_m, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial
          color={isSelected ? "#fbbf24" : "#3f3f46"}
          emissive={isSelected ? "#f59e0b" : seatColor}
          emissiveIntensity={isSelected ? 0.5 : 0.15}
          metalness={0.5}
          roughness={0.4}
          transparent={isGatesOnly}
          opacity={isGatesOnly ? 0.22 : 1}
        />
      </mesh>

      {/* Stepped seating risers */}
      {stepGeometries.map(({ idx, geometry }) => (
        <mesh
          key={`${sector.id}_step_${idx}`}
          geometry={geometry}
          position={[0, sector.elevation_m, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshStandardMaterial
            color={idx % 2 === 0 ? seatColor : concreteColor}
            emissive={
              congestionScore >= 0.62
                ? seatColor
                : isSelected || hovered
                  ? "#f59e0b"
                  : "#000000"
            }
            emissiveIntensity={
              isGatesOnly
                ? 0.04
                : congestionScore >= 0.62
                  ? 0.24
                  : isSelected || hovered
                    ? 0.22
                    : 0.05
            }
            roughness={0.62}
            metalness={0.18}
            transparent={isGatesOnly}
            opacity={isGatesOnly ? 0.2 : 0.96}
          />
        </mesh>
      ))}

      {/* Concrete radial aisle dividers */}
      {!isGatesOnly &&
        radialRibs.map((rib, idx) => (
          <mesh
            key={`${sector.id}_rib_${idx}`}
            position={[rib.x, sector.elevation_m + sector.height_m * 0.45, rib.z]}
            rotation={[0, rib.angleRad, -0.22]}
          >
            <boxGeometry args={[radialLen, 0.7, 0.9]} />
            <meshStandardMaterial
              color="#52525b"
              roughness={0.75}
              metalness={0.2}
            />
          </mesh>
        ))}
    </group>
  );
}

function SolarCanopyRoof({
  innerR,
  outerR,
  elevationM,
  isGatesOnly,
}: {
  innerR: number;
  outerR: number;
  elevationM: number;
  isGatesOnly: boolean;
}) {
  // M. Chinnaswamy is the world's first solar-powered cricket stadium:
  // Eastern Wing roof (-45° to 85°) houses ~1,422 blue PV solar panels.
  const solarWingGeo = useMemo(
    () => createArcExtrudeGeometry(-45, 85, innerR, outerR, 0.7, 32),
    [innerR, outerR]
  );
  const westWingGeo = useMemo(
    () => createArcExtrudeGeometry(132, 228, innerR - 4, outerR, 0.85, 24),
    [innerR, outerR]
  );
  const southWingGeo = useMemo(
    () => createArcExtrudeGeometry(235, 310, innerR + 2, outerR, 0.65, 18),
    [innerR, outerR]
  );

  // Individual photovoltaic solar panel blades on the Eastern Wing
  const solarPanels = useMemo(() => {
    const panels: {
      key: string;
      x: number;
      z: number;
      angleRad: number;
    }[] = [];
    for (let deg = -40; deg <= 80; deg += 10) {
      const rad = (deg * Math.PI) / 180;
      for (const rFrac of [0.28, 0.56, 0.82]) {
        const r = innerR + (outerR - innerR) * rFrac;
        panels.push({
          key: `pv_${deg}_${rFrac}`,
          x: Math.cos(rad) * r,
          z: -Math.sin(rad) * r,
          angleRad: rad,
        });
      }
    }
    return panels;
  }, [innerR, outerR]);

  // Structural steel roof trusses & outer perimeter colonnade pillars
  const roofTrusses = useMemo(() => {
    const trusses: { x: number; z: number; angleRad: number }[] = [];
    for (let i = 0; i < 24; i++) {
      const deg = (i / 24) * 360;
      if (deg > 88 && deg < 128) continue; // Open sightline gap at North-West
      const rad = (deg * Math.PI) / 180;
      const midR = (innerR + outerR) * 0.5;
      trusses.push({
        x: Math.cos(rad) * midR,
        z: -Math.sin(rad) * midR,
        angleRad: rad,
      });
    }
    return trusses;
  }, [innerR, outerR]);

  const outerColumns = useMemo(() => {
    const cols: [number, number][] = [];
    for (let i = 0; i < 32; i++) {
      const rad = (i / 32) * Math.PI * 2;
      cols.push([Math.cos(rad) * (outerR - 4), -Math.sin(rad) * (outerR - 4)]);
    }
    return cols;
  }, [outerR]);

  const opacity = isGatesOnly ? 0.14 : 0.88;

  return (
    <group>
      {/* Eastern Solar Wing Canopy */}
      <mesh
        geometry={solarWingGeo}
        position={[0, elevationM, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial
          color="#1e293b"
          metalness={0.65}
          roughness={0.35}
          transparent
          opacity={opacity}
          depthWrite={!isGatesOnly}
        />
      </mesh>

      {/* Blue Photovoltaic Solar Panel Array on Eastern Wing */}
      {!isGatesOnly &&
        solarPanels.map((p) => (
          <mesh
            key={p.key}
            position={[p.x, elevationM + 0.9, p.z]}
            rotation={[0, p.angleRad, -0.08]}
          >
            <boxGeometry args={[7.2, 0.25, 11.5]} />
            <meshStandardMaterial
              color="#1d4ed8"
              emissive="#1e40af"
              emissiveIntensity={0.35}
              metalness={0.85}
              roughness={0.2}
            />
          </mesh>
        ))}

      {/* West Pavilion & Media Canopy */}
      <mesh
        geometry={westWingGeo}
        position={[0, elevationM + 1.5, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial
          color="#e4e4e7"
          metalness={0.45}
          roughness={0.38}
          transparent
          opacity={isGatesOnly ? 0.14 : 0.82}
          depthWrite={!isGatesOnly}
        />
      </mesh>

      {/* South Stand Canopy */}
      <mesh
        geometry={southWingGeo}
        position={[0, elevationM, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial
          color="#d4d4d8"
          metalness={0.45}
          roughness={0.4}
          transparent
          opacity={isGatesOnly ? 0.14 : 0.78}
          depthWrite={!isGatesOnly}
        />
      </mesh>

      {/* Steel Cantilevered Under-Trusses */}
      {!isGatesOnly &&
        roofTrusses.map((t, idx) => (
          <mesh
            key={`truss_${idx}`}
            position={[t.x, elevationM - 0.8, t.z]}
            rotation={[0, t.angleRad, 0]}
          >
            <boxGeometry args={[outerR - innerR, 0.9, 1.1]} />
            <meshStandardMaterial
              color="#71717a"
              metalness={0.75}
              roughness={0.3}
            />
          </mesh>
        ))}

      {/* Outer Bowl Concrete Colonnade Pillars */}
      {outerColumns.map(([cx, cz], idx) => (
        <mesh key={`col_${idx}`} position={[cx, elevationM * 0.5, cz]}>
          <cylinderGeometry args={[0.9, 1.15, elevationM, 8]} />
          <meshStandardMaterial
            color="#3f3f46"
            roughness={0.8}
            metalness={0.2}
          />
        </mesh>
      ))}
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
  const yaw = Math.atan2(-tx, -tz);
  return (
    <group position={[tx, 0, tz]} rotation={[0, yaw, 0]}>
      {/* Concrete Plinth */}
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[1.6, 2.2, 4, 8]} />
        <meshStandardMaterial color="#3f3f46" roughness={0.8} />
      </mesh>
      {/* Tapered Steel Lattice Mast */}
      <mesh position={[0, heightM / 2, 0]}>
        <cylinderGeometry args={[0.7, 1.4, heightM, 8]} />
        <meshStandardMaterial color="#a1a1aa" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Floodlight Head Frame */}
      <mesh position={[0, heightM + 1.5, 0]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[11, 5.2, 1.4]} />
        <meshStandardMaterial color="#27272a" metalness={0.8} roughness={0.25} />
      </mesh>
      {/* Glowing Warm Stadium Lamps */}
      <mesh position={[0, heightM + 1.5, 0.82]} rotation={[0.35, 0, 0]}>
        <planeGeometry args={[9.8, 4.1]} />
        <meshStandardMaterial
          color="#fef3c7"
          emissive="#fde68a"
          emissiveIntensity={2.6}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function CubbonParkTrees() {
  const trees = useMemo(() => {
    const coords: [number, number, number][] = [
      [-148, 86, 6.2],
      [-156, 58, 7.1],
      [-152, 30, 5.8],
      [-155, -24, 6.5],
      [-146, -68, 5.5],
      [-128, 126, 6.8],
      [-98, 146, 6.0],
      [-64, 152, 5.4],
      [82, 144, 5.6],
      [138, 108, 6.1],
    ];
    return coords;
  }, []);

  return (
    <group>
      {trees.map(([x, y, scale], idx) => {
        const [tx, , tz] = toThree(x, y, 0);
        return (
          <group key={`tree_${idx}`} position={[tx, 0, tz]}>
            <mesh position={[0, 3.2, 0]}>
              <cylinderGeometry args={[0.7, 1.0, 6.4, 6]} />
              <meshStandardMaterial color="#451a03" roughness={0.9} />
            </mesh>
            <mesh position={[0, 7.8, 0]}>
              <dodecahedronGeometry args={[scale, 1]} />
              <meshStandardMaterial color="#14532d" roughness={0.85} />
            </mesh>
          </group>
        );
      })}
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
  const score = telemetry?.congestion_score ?? 0.25;
  const visuals = getCongestionVisuals(telemetry?.status ?? "optimal");
  const color = isSelected ? "#fbbf24" : isOnRoute ? "#34d399" : visuals.hex;
  const [px, py, pz] = toThree(node.x, node.y, node.z ?? 0);
  const yaw = Math.atan2(px, pz);

  return (
    <group
      position={[px, py, pz]}
      rotation={[0, yaw, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(node.id);
      }}
    >
      {/* Architectural Gate Arch */}
      <mesh position={[-3.2, 3.8, 0]}>
        <boxGeometry args={[1.1, 7.6, 1.4]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected || isOnRoute ? 1.1 : 0.45}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[3.2, 3.8, 0]}>
        <boxGeometry args={[1.1, 7.6, 1.4]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected || isOnRoute ? 1.1 : 0.45}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 7.7, 0]}>
        <boxGeometry args={[8.2, 1.35, 2.0]} />
        <meshStandardMaterial
          color="#18181b"
          emissive={color}
          emissiveIntensity={0.45}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      {/* Glowing Base Pad */}
      <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.4, 4.9, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      {(showLabel || isSelected || hovered || isOnRoute) && (
        <Html center distanceFactor={195} position={[0, 12.2, 0]}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(node.id);
            }}
            className={`whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-semibold shadow-sm transition ${
              isSelected
                ? "border-amber-500 bg-amber-50 text-amber-900"
                : isOnRoute
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                  : "border-slate-300 bg-white/95 text-slate-900 hover:border-slate-500"
            }`}
          >
            {node.stand_code ?? node.name} · {Math.round(score * 100)}%
          </button>
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
  const score = telemetry?.congestion_score ?? 0.2;
  const visuals = getCongestionVisuals(telemetry?.status ?? "optimal");
  const color = isSelected
    ? "#fbbf24"
    : isOnRoute
      ? "#34d399"
      : node.type === "medical"
        ? "#fb7185"
        : node.type === "transit"
          ? "#38bdf8"
          : visuals.hex;

  const [px, py, pz] = toThree(node.x, node.y, node.z ?? 0);
  const scale = isSelected ? 1.35 : hovered ? 1.2 : 1;

  return (
    <group
      position={[px, py + 2.2, pz]}
      scale={[scale, scale, scale]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(node.id);
      }}
    >
      <mesh>
        {node.type === "transit" ? (
          <boxGeometry args={[4.4, 2.8, 4.4]} />
        ) : (
          <cylinderGeometry args={[1.8, 2.2, 2.8, 12]} />
        )}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected || isOnRoute ? 1.1 : 0.4}
          roughness={0.35}
          metalness={0.5}
        />
      </mesh>

      {(isSelected || hovered || isOnRoute) && (
        <Html center distanceFactor={215} position={[0, 4.4, 0]}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(node.id);
            }}
            className={`whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold shadow transition ${
              isSelected
                ? "border-amber-300 bg-zinc-950/95 text-amber-200"
                : isOnRoute
                  ? "border-emerald-400 bg-emerald-950/95 text-emerald-100"
                  : "border-zinc-700/80 bg-zinc-950/85 text-zinc-200"
            }`}
          >
            {node.stand_code ?? node.name}
          </button>
        </Html>
      )}
    </group>
  );
}

function IncidentBeacon3D({
  incident,
  node,
  onSelect,
  showLabel,
}: {
  incident: AlertIncident;
  node?: StadiumNode;
  onSelect?: (nodeId: string) => void;
  showLabel: boolean;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const [px, py, pz] = toThree(
    node?.x ?? 0,
    node?.y ?? 0,
    node?.z ?? 6
  );

  useFrame(({ clock }) => {
    if (ringRef.current) {
      const s = 1 + 0.45 * Math.sin(clock.getElapsedTime() * 4.2);
      ringRef.current.scale.set(s, s, 1);
    }
  });

  const color = incident.severity === "critical" ? "#ef4444" : "#f97316";

  return (
    <group
      position={[px, py + 7, pz]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(incident.node_id);
      }}
    >
      <mesh position={[0, 3.5, 0]}>
        <coneGeometry args={[2.1, 5.2, 6]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.4, 5.1, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.4}
          transparent
          opacity={0.75}
          side={THREE.DoubleSide}
        />
      </mesh>
      {showLabel && (
        <Html center distanceFactor={210} position={[0, 8.6, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-red-400/70 bg-red-950/95 px-2 py-0.5 text-[10px] font-bold text-red-100 shadow-lg">
            ⚠ {incident.title}
          </div>
        </Html>
      )}
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
  const pinRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (pinRef.current) {
      pinRef.current.position.y =
        sy + 6.5 + Math.sin(clock.getElapsedTime() * 3.0) * 1.1;
    }
  });

  return (
    <group>
      <mesh position={[sx, sy + 0.8, sz]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.6, 4.1, 24]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#f59e0b"
          emissiveIntensity={1.5}
          side={THREE.DoubleSide}
        />
      </mesh>
      <group ref={pinRef} position={[sx, sy + 6.5, sz]}>
        <mesh rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[2.0, 4.5, 6]} />
          <meshStandardMaterial
            color="#fde047"
            emissive="#f59e0b"
            emissiveIntensity={1.7}
            toneMapped={false}
          />
        </mesh>
      </group>
      {showLabel && (
        <Html center distanceFactor={195} position={[sx, sy + 13, sz]}>
          <div className="pointer-events-none whitespace-nowrap rounded-lg border border-amber-400 bg-amber-950/95 px-2 py-0.5 text-[10px] font-bold text-amber-200 shadow-lg">
            Seat {seat.normalizedLabel}
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
  const pulseRef = useRef<THREE.Mesh>(null);
  const [ux, uy, uz] = toThree(position.x, position.y, position.z);

  useFrame(({ clock }) => {
    if (pulseRef.current) {
      const s = 1 + 0.55 * ((clock.getElapsedTime() * 1.4) % 1);
      pulseRef.current.scale.set(s, s, 1);
    }
  });

  return (
    <group position={[ux, uy + 1.5, uz]}>
      <mesh position={[0, 1.8, 0]}>
        <capsuleGeometry args={[1.25, 2.2, 6, 12]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#0284c7"
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={pulseRef} position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.8, 4.4, 32]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#38bdf8"
          emissiveIntensity={1.5}
          transparent
          opacity={0.75}
          side={THREE.DoubleSide}
        />
      </mesh>
      {showLabel && (
        <Html center distanceFactor={195} position={[0, 7.6, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-full border border-sky-400 bg-zinc-950/95 px-2.5 py-0.5 text-[10px] font-bold text-sky-200 shadow-lg">
            YOU ARE HERE
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
  const pulseDotRef = useRef<THREE.Mesh>(null);

  const curve = useMemo(() => {
    if (waypoints.length < 2) return null;
    const expanded = buildDetailedStadiumPath(waypoints);
    const pts = expanded.map((wp) => {
      const [px, py, pz] = toThree(wp.x, wp.y, wp.z + 1.15);
      return new THREE.Vector3(px, py, pz);
    });
    return new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.25);
  }, [waypoints]);

  const tubeGeometry = useMemo(() => {
    if (!curve) return null;
    return new THREE.TubeGeometry(curve, 96, 0.95, 8, false);
  }, [curve]);

  const outlinePoints = useMemo<[number, number, number][]>(() => {
    if (!curve) return [];
    return curve.getPoints(96).map((p) => [p.x, p.y + 0.55, p.z]);
  }, [curve]);

  const directionArrows = useMemo(() => {
    if (!curve) return [];
    const count = 8;
    const arrows: { pos: [number, number, number]; yaw: number }[] = [];
    for (let i = 1; i < count; i++) {
      const t = i / count;
      const pt = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const yaw = Math.atan2(tangent.x, tangent.z);
      arrows.push({ pos: [pt.x, pt.y + 0.9, pt.z], yaw });
    }
    return arrows;
  }, [curve]);

  useFrame(({ clock }) => {
    if (pulseDotRef.current && curve) {
      const t = (clock.getElapsedTime() * 0.24) % 1;
      const pt = curve.getPointAt(t);
      pulseDotRef.current.position.set(pt.x, pt.y + 1.1, pt.z);
    }
  });

  if (waypoints.length === 0) return null;

  const finalWp = waypoints[waypoints.length - 1];
  const [fx, fy, fz] = toThree(finalWp.x, finalWp.y, finalWp.z + 1.2);
  const trailColor = isExitRoute ? "#059669" : "#2563eb";
  const accentColor = isExitRoute ? "#10b981" : "#3b82f6";

  return (
    <group>
      {/* Solid Walkway Corridor Tube */}
      {tubeGeometry && (
        <mesh geometry={tubeGeometry}>
          <meshStandardMaterial
            color={trailColor}
            emissive={accentColor}
            emissiveIntensity={0.35}
            roughness={0.35}
            metalness={0.2}
          />
        </mesh>
      )}

      {/* Crisp Center Guideline */}
      {outlinePoints.length > 1 && (
        <Line points={outlinePoints} color="#ffffff" lineWidth={2} />
      )}

      {/* Directional Arrow Chevrons along the walkway */}
      {directionArrows.map((arrow, idx) => (
        <mesh
          key={`arrow_${idx}`}
          position={arrow.pos}
          rotation={[Math.PI / 2, 0, -arrow.yaw]}
        >
          <coneGeometry args={[1.15, 2.4, 3]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive={accentColor}
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}

      {/* Moving Walker Guide Dot */}
      {curve && (
        <mesh ref={pulseDotRef}>
          <sphereGeometry args={[1.85, 14, 14]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive={accentColor}
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Intermediate Waypoint Checkpoints */}
      {waypoints.slice(1, -1).map((wp, idx) => {
        const [wx, wy, wz] = toThree(wp.x, wp.y, wp.z + 1.5);
        return (
          <mesh key={`wp_${wp.node_id}_${idx}`} position={[wx, wy, wz]}>
            <cylinderGeometry args={[1.2, 1.2, 1.0, 12]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive={accentColor}
              emissiveIntensity={0.8}
            />
          </mesh>
        );
      })}

      {/* Destination Waypoint Pillar */}
      <group position={[fx, fy, fz]}>
        <mesh position={[0, 11, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 22, 8]} />
          <meshStandardMaterial
            color={trailColor}
            emissive={accentColor}
            emissiveIntensity={0.8}
            transparent
            opacity={0.85}
          />
        </mesh>
        <mesh position={[0, 23, 0]}>
          <octahedronGeometry args={[2.5, 0]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive={accentColor}
            emissiveIntensity={1.4}
            toneMapped={false}
          />
        </mesh>
        {showLabels && (
          <Html center distanceFactor={205} position={[0, 28, 0]}>
            <div
              className={`pointer-events-none whitespace-nowrap rounded border px-2.5 py-1 text-[10px] font-bold shadow-sm ${
                isExitRoute
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                  : "border-blue-600 bg-blue-50 text-blue-900"
              }`}
            >
              {isExitRoute ? "BEST EXIT: " : "DESTINATION: "}
              {targetLabel ?? finalWp.node_id}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

function CameraRig({
  cameraRequest,
  navCommand,
  dragMode,
  userPosition,
  seatLocation,
}: {
  cameraRequest: CameraTargetSpec;
  navCommand: CameraNavCommand;
  dragMode: "rotate" | "pan";
  userPosition?: UserPosition3D | null;
  seatLocation?: DetectedSeatLocation | null;
}) {
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const animatingRef = useRef(false);
  const goalPosRef = useRef(new THREE.Vector3(0, 165, 225));
  const goalTargetRef = useRef(new THREE.Vector3(0, 6, 0));

  const userPosRef = useRef(userPosition);
  userPosRef.current = userPosition;
  const seatRef = useRef(seatLocation);
  seatRef.current = seatLocation;

  useEffect(() => {
    if (cameraRequest.id === 0) return;
    const preset = cameraRequest.preset;
    if (preset === "aerial") {
      goalPosRef.current.set(0, 165, 225);
      goalTargetRef.current.set(0, 6, 0);
    } else if (preset === "top_down") {
      goalPosRef.current.set(0, 285, 18);
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

  useEffect(() => {
    if (navCommand.id === 0 || !controlsRef.current) return;
    const target = controlsRef.current.target.clone();
    const offset = camera.position.clone().sub(target);
    if (navCommand.type === "zoom_in") {
      offset.multiplyScalar(0.76);
      if (offset.length() < 28) offset.setLength(28);
    } else if (navCommand.type === "zoom_out") {
      offset.multiplyScalar(1.28);
      if (offset.length() > 450) offset.setLength(450);
    } else if (navCommand.type === "rotate_left") {
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6);
    } else if (navCommand.type === "rotate_right") {
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 6);
    }
    goalTargetRef.current.copy(target);
    goalPosRef.current.copy(target).add(offset);
    animatingRef.current = true;
  }, [navCommand.id, navCommand.type, camera]);

  useFrame((_, delta) => {
    if (!animatingRef.current || !controlsRef.current) return;
    const alpha = Math.min(1, delta * 6.0);
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
      dampingFactor={0.1}
      enableZoom
      enablePan
      enableRotate
      screenSpacePanning
      rotateSpeed={0.9}
      zoomSpeed={1.3}
      panSpeed={1.25}
      minDistance={28}
      maxDistance={460}
      maxPolarAngle={Math.PI * 0.495}
      mouseButtons={{
        LEFT: dragMode === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: dragMode === "pan" ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
      }}
      touches={{
        ONE: dragMode === "pan" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
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
  dragMode,
  cameraRequest,
  navCommand,
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
  const boundaryPts = useMemo(() => buildRingPoints(fieldRadius, 0.4), [fieldRadius]);
  const innerCirclePts = useMemo(() => buildRingPoints(27.4, 0.42, 64), []);
  const concourseRingPts = useMemo(() => buildRingPoints(102, 0.25), []);
  const plazaRingPts = useMemo(() => buildRingPoints(136, 0.22), []);

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
      <color attach="background" args={["#e2e8f0"]} />
      <fog attach="fog" args={["#e2e8f0", 380, 760]} />
      <hemisphereLight args={["#ffffff", "#94a3b8", 1.1]} />
      <directionalLight position={[120, 220, 140]} intensity={1.35} color="#fffbeb" />
      <directionalLight position={[-110, 150, -90]} intensity={0.6} color="#e0f2fe" />

      <CameraRig
        cameraRequest={cameraRequest}
        navCommand={navCommand}
        dragMode={dragMode}
        userPosition={userPosition}
        seatLocation={seatLocation}
      />

      {/* Bengaluru Urban Stadium Plinth & Outer Concourse */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onClick={handleFloorClick}
      >
        <circleGeometry args={[182, 72]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.9} metalness={0.05} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <ringGeometry args={[70, 136, 72]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.85} metalness={0.08} />
      </mesh>
      <Line points={concourseRingPts} color="#94a3b8" lineWidth={1.2} />
      <Line points={plazaRingPts} color="#64748b" lineWidth={1.4} />

      {/* SubAir Cricket Outfield with Mowed Grass Rings */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.16, 0]}>
        <circleGeometry args={[fieldRadius, 72]} />
        <meshStandardMaterial color="#16a34a" roughness={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.19, 0]}>
        <circleGeometry args={[48, 64]} />
        <meshStandardMaterial color="#15803d" roughness={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.21, 0]}>
        <circleGeometry args={[27.4, 64]} />
        <meshStandardMaterial color="#22c55e" roughness={0.92} />
      </mesh>

      {/* LED Crimson Boundary Advertising Perimeter Ring */}
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry
          args={[fieldRadius + 1.2, fieldRadius + 1.2, 1.3, 72, 1, true]}
        />
        <meshStandardMaterial
          color="#9f1239"
          emissive="#be123c"
          emissiveIntensity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Line points={boundaryPts} color="#f8fafc" lineWidth={2} />
      <Line points={innerCirclePts} color="#e2e8f0" lineWidth={1.2} transparent opacity={0.6} />

      {/* Central 22-Yard Cricket Pitch & Stumps */}
      <mesh position={[0, 0.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.15, spec?.pitch_length_m ?? 20.12]} />
        <meshStandardMaterial color="#d6c29b" roughness={0.92} />
      </mesh>
      {/* Bowling Crease Lines */}
      <Line
        points={[
          [-2.0, 0.31, -8.84],
          [2.0, 0.31, -8.84],
        ]}
        color="#f8fafc"
        lineWidth={1.5}
      />
      <Line
        points={[
          [-2.0, 0.31, 8.84],
          [2.0, 0.31, 8.84],
        ]}
        color="#f8fafc"
        lineWidth={1.5}
      />
      {/* Stumps at North & South Ends */}
      {[-10.06, 10.06].map((zOff) => (
        <group key={`stumps_${zOff}`} position={[0, 0.65, zOff]}>
          {[-0.14, 0, 0.14].map((xOff) => (
            <mesh key={xOff} position={[xOff, 0, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.72, 6]} />
              <meshStandardMaterial color="#fef08a" />
            </mesh>
          ))}
        </group>
      ))}

      {/* North & South Sightscreens */}
      {[-70.5, 70.5].map((zPos) => (
        <mesh key={`sightscreen_${zPos}`} position={[0, 4.2, zPos]}>
          <boxGeometry args={[14, 6.2, 0.8]} />
          <meshStandardMaterial color="#f4f4f5" roughness={0.6} />
        </mesh>
      ))}

      {showLabels && spec?.ends && (
        <>
          <Html center distanceFactor={235} position={[0, 4, -52]}>
            <div className="pointer-events-none whitespace-nowrap rounded border border-slate-300 bg-white/90 px-2 py-0.5 text-[9px] font-semibold text-slate-800 shadow-sm">
              {spec.ends.north_end}
            </div>
          </Html>
          <Html center distanceFactor={235} position={[0, 4, 52]}>
            <div className="pointer-events-none whitespace-nowrap rounded border border-slate-300 bg-white/90 px-2 py-0.5 text-[9px] font-semibold text-slate-800 shadow-sm">
              {spec.ends.south_end}
            </div>
          </Html>
        </>
      )}

      {showLabels &&
        spec?.perimeter_roads?.map((road) => {
          const [rx, , rz] = toThree(road.label_x, road.label_y, 0);
          return (
            <Html key={road.name} center distanceFactor={265} position={[rx, 2.5, rz]}>
              <div className="pointer-events-none whitespace-nowrap rounded border border-slate-300 bg-white/95 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-700 shadow-sm">
                {road.name}
              </div>
            </Html>
          );
        })}

      {/* Stepped Multi-Tier Seating Sectors */}
      {spec?.stand_sectors?.map((sector) => {
        const score = telemetryMap.get(sector.linked_node_id)?.congestion_score ?? 0.3;
        return (
          <SteppedStandSector
            key={sector.id}
            sector={sector}
            congestionScore={score}
            isSelected={selectedNodeId === sector.linked_node_id}
            isGatesOnly={layerFilter === "route_only"}
            onSelect={onSelectNode}
          />
        );
      })}

      {/* Cantilevered Solar Canopy Roof + Outer Bowl Colonnade */}
      <SolarCanopyRoof
        innerR={spec?.canopy_ring?.inner_radius_m ?? 94}
        outerR={spec?.canopy_ring?.outer_radius_m ?? 132}
        elevationM={spec?.canopy_ring?.elevation_m ?? 26}
        isGatesOnly={layerFilter === "route_only"}
      />

      {/* 4 Symmetrical Floodlight Towers */}
      {spec?.floodlight_towers?.map((tower) => (
        <FloodlightTower
          key={tower.id}
          x={tower.x}
          y={tower.y}
          heightM={tower.height_m}
        />
      ))}

      {/* Cubbon Park Foliage Perimeter */}
      <CubbonParkTrees />

      {/* Walkable Concourse Pathways */}
      {layerFilter !== "gates_only" &&
        topology.edges.map((edge) => {
          const from = nodeMap.get(edge.from_node);
          const to = nodeMap.get(edge.to_node);
          if (!from || !to) return null;
          return (
            <Line
              key={edge.id}
              points={[
                toThree(from.x, from.y, (from.z ?? 0) + 0.45),
                toThree(to.x, to.y, (to.z ?? 0) + 0.45),
              ]}
              color={edge.accessible === false ? "#a855f7" : "#3f3f46"}
              lineWidth={1.1}
              transparent
              opacity={0.45}
            />
          );
        })}

      {/* Stadium Gate Portals & Facility Pods */}
      {topology.nodes.map((node) => {
        const telem = telemetryMap.get(node.id);
        const isGate = node.type === "gate";
        const isAmenity =
          node.type === "concession" ||
          node.type === "restroom" ||
          node.type === "medical";
        const onRoute = routeSet.has(node.id);
        const isSelected = selectedNodeId === node.id;

        if (layerFilter === "gates_only" && !isGate && !onRoute && !isSelected) {
          return null;
        }
        if (layerFilter === "amenities" && !isAmenity && !isGate && !onRoute && !isSelected) {
          return null;
        }
        if (layerFilter === "route_only" && !onRoute && !isSelected) {
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
      {activeIncidents.map((inc) => (
        <IncidentBeacon3D
          key={inc.incident_id}
          incident={inc}
          node={nodeMap.get(inc.node_id)}
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
