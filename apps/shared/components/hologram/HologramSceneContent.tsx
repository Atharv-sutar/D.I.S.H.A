"use client";

import { useEffect, useMemo, useRef } from "react";
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
  | "congestion"
  | "exits"
  | "waypoints"
  | "amenities";

export type CameraPreset =
  | "aerial"
  | "follow_me"
  | "top_down"
  | "pitch_view"
  | "exits";

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

function buildRingPoints(radius: number, yHeight: number, segments = 96): [number, number, number][] {
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

  const segments = 28;
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

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: sector.height_m,
    bevelEnabled: false,
    curveSegments: 24,
  });
  return geom;
}

function sectorColor(score: number): string {
  if (score >= 0.8) return "#ef4444";
  if (score >= 0.6) return "#f97316";
  if (score >= 0.35) return "#f59e0b";
  return "#06b6d4";
}

function StandSectorMesh({
  sector,
  congestionScore,
  isSelected,
  dimmed,
  onSelect,
}: {
  sector: StandSector;
  congestionScore: number;
  isSelected: boolean;
  dimmed: boolean;
  onSelect?: (nodeId: string) => void;
}) {
  const { extrudeGeom, edgesGeom } = useMemo(() => {
    const g = createStandSectorGeometry(sector);
    const e = new THREE.EdgesGeometry(g, 22);
    return { extrudeGeom: g, edgesGeom: e };
  }, [sector]);

  useEffect(() => {
    return () => {
      extrudeGeom.dispose();
      edgesGeom.dispose();
    };
  }, [extrudeGeom, edgesGeom]);

  const fillMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const color = sectorColor(congestionScore);

  useFrame(({ clock }) => {
    if (!fillMatRef.current) return;
    if (congestionScore >= 0.72) {
      const pulse = 0.22 + 0.14 * Math.sin(clock.getElapsedTime() * 4.2);
      fillMatRef.current.opacity = dimmed ? 0.08 : pulse;
    } else {
      fillMatRef.current.opacity = dimmed ? 0.07 : isSelected ? 0.32 : 0.16;
    }
  });

  return (
    <group
      position={[0, sector.elevation_m, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <mesh
        geometry={extrudeGeom}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(sector.linked_node_id);
        }}
      >
        <meshStandardMaterial
          ref={fillMatRef}
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.9 : 0.45}
          transparent
          opacity={dimmed ? 0.07 : 0.18}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={edgesGeom}>
        <lineBasicMaterial
          color={isSelected ? "#ffffff" : color}
          transparent
          opacity={dimmed ? 0.2 : 0.72}
        />
      </lineSegments>
    </group>
  );
}

function FloodlightTowerMesh({
  x,
  y,
  heightM,
}: {
  x: number;
  y: number;
  heightM: number;
}) {
  const [tx, , tz] = toThree(x, y, 0);
  return (
    <group position={[tx, 0, tz]}>
      <mesh position={[0, heightM / 2, 0]}>
        <cylinderGeometry args={[0.9, 2.2, heightM, 6, 1, true]} />
        <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, heightM + 1.5, 0]}>
        <boxGeometry args={[9, 4.2, 2.2]} />
        <meshStandardMaterial
          color="#bae6fd"
          emissive="#38bdf8"
          emissiveIntensity={1.6}
          transparent
          opacity={0.75}
        />
      </mesh>
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
      const s = 1 + (t % 1.6) * 0.9;
      ringRef.current.scale.set(s, s, 1);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0.08, 0.85 - (t % 1.6) * 0.5);
    }
    if (beaconRef.current) {
      beaconRef.current.position.y = uy + 5.2 + Math.sin(t * 3.2) * 0.8;
    }
  });

  return (
    <group>
      {/* Expanding radar sonar ring */}
      <mesh
        ref={ringRef}
        position={[ux, uy + 0.35, uz]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[3.2, 4.4, 32]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>

      {/* Directional heading wedge */}
      <group position={[ux, uy + 0.6, uz]} rotation={[0, headingRad, 0]}>
        <mesh position={[0, 0, -5.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[3.5, 9, 3]} />
          <meshBasicMaterial color="#67e8f9" transparent opacity={0.45} />
        </mesh>
      </group>

      {/* Glowing user beacon pillar & diamond */}
      <group ref={beaconRef} position={[ux, uy + 5.2, uz]}>
        <mesh>
          <octahedronGeometry args={[2.6, 0]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#22d3ee"
            emissiveIntensity={2.0}
          />
        </mesh>
        <mesh position={[0, -2.5, 0]}>
          <cylinderGeometry args={[0.35, 0.35, 5, 12]} />
          <meshBasicMaterial color="#a5f3fc" transparent opacity={0.85} />
        </mesh>
        {showLabel && (
          <Html center distanceFactor={190} position={[0, 5.2, 0]}>
            <div className="pointer-events-none whitespace-nowrap rounded-full border border-cyan-300/80 bg-slate-950/90 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.65)]">
              YOU ARE HERE • L{position.level}
            </div>
          </Html>
        )}
      </group>
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
  const trailColor = isExitRoute ? "#34d399" : "#22d3ee";
  const particleRefs = useRef<(THREE.Mesh | null)[]>([]);
  const beaconSpinRef = useRef<THREE.Mesh>(null);

  const { curve, tubeGeom } = useMemo(() => {
    if (waypoints.length < 2) {
      return { curve: null, tubeGeom: null };
    }
    const pts = waypoints.map((w) => {
      const [x, y, z] = toThree(w.x, w.y, w.z + 2.4);
      return new THREE.Vector3(x, y, z);
    });
    const c = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.25);
    const tg = new THREE.TubeGeometry(c, Math.max(24, pts.length * 14), 0.95, 8, false);
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
        const u = (t * 0.28 + i / count) % 1;
        const pos = curve.getPointAt(u);
        mesh.position.copy(pos);
      }
    }
    if (beaconSpinRef.current) {
      beaconSpinRef.current.rotation.y = t * 1.8;
      beaconSpinRef.current.position.y = 14 + Math.sin(t * 2.8) * 1.2;
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
            emissiveIntensity={1.4}
            transparent
            opacity={0.78}
          />
        </mesh>
      )}

      {/* Animated traveling waypoint light orbs */}
      {curve &&
        [0, 1, 2, 3, 4, 5].map((idx) => (
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
              emissiveIntensity={2.4}
            />
          </mesh>
        ))}

      {/* Waypoint milestone markers */}
      {waypoints.map((wp) => {
        const [wx, wy, wz] = toThree(wp.x, wp.y, wp.z + 2.6);
        const isLevelChange = wp.waypoint_type === "level_transition";
        const isWarn = wp.waypoint_type === "reroute_avoidance";
        const markerColor = isWarn
          ? "#f59e0b"
          : isLevelChange
            ? "#a855f7"
            : trailColor;

        if (wp.waypoint_type === "origin" || wp.waypoint_type === "destination") {
          return null;
        }
        return (
          <group key={`wp_${wp.order}_${wp.node_id}`} position={[wx, wy, wz]}>
            <mesh>
              <octahedronGeometry args={[1.6, 0]} />
              <meshStandardMaterial
                color={markerColor}
                emissive={markerColor}
                emissiveIntensity={1.5}
              />
            </mesh>
            {isLevelChange && (
              <mesh position={[0, -4, 0]}>
                <cylinderGeometry args={[0.45, 0.45, 10, 10]} />
                <meshBasicMaterial color="#c084fc" transparent opacity={0.75} />
              </mesh>
            )}
            {showLabels && (
              <Html center distanceFactor={210} position={[0, 3.2, 0]}>
                <div className="pointer-events-none whitespace-nowrap rounded border border-cyan-400/50 bg-slate-950/85 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-200">
                  WP {wp.order}
                  {isLevelChange ? ` • L${wp.level}` : ""}
                </div>
              </Html>
            )}
          </group>
        );
      })}

      {/* Game-style tall objective pillar at target_beacon */}
      <group position={[dx, dy, dz]}>
        <mesh position={[0, 11, 0]}>
          <cylinderGeometry args={[1.1, 2.2, 22, 16, 1, true]} />
          <meshBasicMaterial
            color={trailColor}
            transparent
            opacity={0.38}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh ref={beaconSpinRef} position={[0, 14, 0]}>
          <octahedronGeometry args={[3.4, 0]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive={trailColor}
            emissiveIntensity={2.2}
          />
        </mesh>
        {showLabels && (
          <Html center distanceFactor={195} position={[0, 23, 0]}>
            <div
              className={`pointer-events-none whitespace-nowrap rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-lg ${
                isExitRoute
                  ? "border-emerald-300/80 bg-emerald-950/90 text-emerald-200"
                  : "border-cyan-300/80 bg-slate-950/90 text-cyan-100"
              }`}
            >
              {isExitRoute ? "EXIT WAYPOINT" : "TARGET WAYPOINT"}:{" "}
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
      diamondRef.current.rotation.y = t * 2.4;
      diamondRef.current.position.y = 11.5 + Math.sin(t * 4) * 1.1;
    }
  });

  return (
    <group position={[ix, iy, iz]}>
      <mesh
        ref={diamondRef}
        position={[0, 11.5, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(incident.node_id);
        }}
      >
        <octahedronGeometry args={[3.2, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2.0}
        />
      </mesh>
      <mesh position={[0, 5.5, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 11, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} />
      </mesh>
      {showLabel && (
        <Html center distanceFactor={210} position={[0, 16.5, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded border border-red-400/75 bg-red-950/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-100">
            ALERT • {incident.category.replace("_", " ")}
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
  const pinRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (pinRef.current) {
      const t = clock.getElapsedTime();
      pinRef.current.rotation.y = t * 1.9;
      pinRef.current.position.y = 7.5 + Math.sin(t * 3.0) * 0.9;
    }
  });

  return (
    <group position={[sx, sy, sz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.35, 0]}>
        <ringGeometry args={[2.5, 4.2, 24]} />
        <meshBasicMaterial color="#fbbf24" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 3.8, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 7.6, 10]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.85} />
      </mesh>
      <mesh ref={pinRef} position={[0, 7.5, 0]}>
        <octahedronGeometry args={[2.5, 0]} />
        <meshStandardMaterial
          color="#fef08a"
          emissive="#f59e0b"
          emissiveIntensity={2.0}
        />
      </mesh>
      {showLabel && (
        <Html center distanceFactor={195} position={[0, 12.2, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-lg border border-amber-300/80 bg-amber-950/90 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.55)]">
            MY SEAT • {seat.normalizedLabel} (L{seat.level})
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
  const goalPosRef = useRef(new THREE.Vector3(0, 155, 225));
  const goalTargetRef = useRef(new THREE.Vector3(0, 8, 0));
  const userPosRef = useRef(userPosition);
  const seatRef = useRef(seatLocation);

  userPosRef.current = userPosition;
  seatRef.current = seatLocation;

  useEffect(() => {
    if (cameraRequest.id === 0) return;
    const preset = cameraRequest.preset;
    if (preset === "aerial") {
      goalPosRef.current.set(0, 155, 225);
      goalTargetRef.current.set(0, 8, 0);
    } else if (preset === "top_down") {
      goalPosRef.current.set(0, 275, 22);
      goalTargetRef.current.set(0, 0, 0);
    } else if (preset === "pitch_view") {
      goalPosRef.current.set(0, 14, 52);
      goalTargetRef.current.set(0, 16, -85);
    } else if (preset === "exits") {
      goalPosRef.current.set(-160, 120, 165);
      goalTargetRef.current.set(0, 4, 0);
    } else if (preset === "follow_me") {
      const targetPos = userPosRef.current ?? seatRef.current;
      if (targetPos) {
        const [ux, uy, uz] = toThree(targetPos.x, targetPos.y, targetPos.z);
        goalTargetRef.current.set(ux, uy + 4, uz);
        goalPosRef.current.set(ux + 55, uy + 58, uz + 65);
      }
    }
    animatingRef.current = true;
  }, [cameraRequest.id, cameraRequest.preset]);

  useFrame((_, delta) => {
    if (!animatingRef.current || !controlsRef.current) return;
    const alpha = Math.min(1, delta * 4.5);
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
      dampingFactor={0.07}
      enableZoom
      enablePan
      enableRotate
      minDistance={32}
      maxDistance={420}
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

  const spec = topology.hologram_spec;
  const fieldRadius = spec?.field_radius_m ?? 68;
  const outerRingPts = useMemo(() => buildRingPoints(fieldRadius, 0.4), [fieldRadius]);
  const innerCirclePts = useMemo(() => buildRingPoints(27.4, 0.45, 64), []);
  const radarRing1 = useMemo(() => buildRingPoints(102, 0.25), []);
  const radarRing2 = useMemo(() => buildRingPoints(134, 0.25), []);
  const radarRing3 = useMemo(() => buildRingPoints(162, 0.25), []);
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

  const showWaypoints =
    layerFilter === "all" ||
    layerFilter === "waypoints" ||
    layerFilter === "exits";

  const isExitRoute =
    guidance?.target_beacon?.node_id !== undefined &&
    nodeMap.get(guidance.target_beacon.node_id)?.type === "gate" &&
    guidance.steps.some((s) => s.instruction.toLowerCase().includes("exit"));

  return (
    <>
      <color attach="background" args={["#030816"]} />
      <fog attach="fog" args={["#030816", 240, 520]} />
      <ambientLight intensity={0.45} />
      <pointLight position={[0, 120, 0]} intensity={1.8} color="#38bdf8" />
      <pointLight position={[-120, 80, 120]} intensity={0.9} color="#06b6d4" />
      <pointLight position={[120, 80, -120]} intensity={0.9} color="#10b981" />

      <CameraRig
        cameraRequest={cameraRequest}
        userPosition={userPosition}
        seatLocation={seatLocation}
      />

      {/* Clickable Holographic Radar Ground Plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onClick={handleFloorClick}
      >
        <circleGeometry args={[175, 72]} />
        <meshBasicMaterial color="#061428" transparent opacity={0.58} />
      </mesh>
      <gridHelper args={[340, 34, "#0e7490", "#082f49"]} position={[0, 0.08, 0]} />

      {/* Concentric Hologram Radar Rings */}
      <Line points={radarRing1} color="#0891b2" lineWidth={1} transparent opacity={0.4} />
      <Line points={radarRing2} color="#0891b2" lineWidth={1} transparent opacity={0.35} />
      <Line points={radarRing3} color="#0e7490" lineWidth={1} transparent opacity={0.28} />

      {/* Cricket Field Boundary, 30-Yard Circle & Central Pitch */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <circleGeometry args={[fieldRadius, 64]} />
        <meshBasicMaterial color="#064e3b" transparent opacity={0.32} />
      </mesh>
      <Line points={outerRingPts} color="#2dd4bf" lineWidth={2} />
      <Line points={innerCirclePts} color="#14b8a6" lineWidth={1} transparent opacity={0.55} />
      <mesh position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.2, spec?.pitch_length_m ?? 20.12]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.45} />
      </mesh>

      {showLabels && spec?.ends && (
        <>
          <Html center distanceFactor={230} position={[0, 3, -52]}>
            <div className="pointer-events-none whitespace-nowrap rounded border border-teal-400/40 bg-slate-950/80 px-2 py-0.5 text-[9px] font-semibold text-teal-200">
              {spec.ends.north_end}
            </div>
          </Html>
          <Html center distanceFactor={230} position={[0, 3, 52]}>
            <div className="pointer-events-none whitespace-nowrap rounded border border-teal-400/40 bg-slate-950/80 px-2 py-0.5 text-[9px] font-semibold text-teal-200">
              {spec.ends.south_end}
            </div>
          </Html>
        </>
      )}

      {/* Perimeter Road Labels */}
      {showLabels &&
        spec?.perimeter_roads?.map((road) => {
          const [rx, , rz] = toThree(road.label_x, road.label_y, 0);
          return (
            <Html key={road.name} center distanceFactor={260} position={[rx, 2, rz]}>
              <div className="pointer-events-none whitespace-nowrap rounded bg-slate-900/75 px-2 py-0.5 text-[9px] font-medium uppercase tracking-widest text-cyan-300/80">
                {road.name}
              </div>
            </Html>
          );
        })}

      {/* 3D Holographic Stand Sectors */}
      {spec?.stand_sectors?.map((sector) => {
        const score = telemetryMap.get(sector.linked_node_id)?.congestion_score ?? 0.3;
        return (
          <StandSectorMesh
            key={sector.id}
            sector={sector}
            congestionScore={score}
            isSelected={selectedNodeId === sector.linked_node_id}
            dimmed={layerFilter === "exits"}
            onSelect={onSelectNode}
          />
        );
      })}

      {/* Solar Canopy Ring & Struts */}
      <Line points={canopyInner} color="#38bdf8" lineWidth={1.5} transparent opacity={0.6} />
      <Line points={canopyOuter} color="#22d3ee" lineWidth={1.5} transparent opacity={0.5} />
      {canopyStruts.map((pair, idx) => (
        <Line
          key={`strut_${idx}`}
          points={pair}
          color="#0284c7"
          lineWidth={1}
          transparent
          opacity={0.35}
        />
      ))}

      {/* 4 Iconic Floodlight Towers */}
      {spec?.floodlight_towers?.map((tower) => (
        <FloodlightTowerMesh
          key={tower.id}
          x={tower.x}
          y={tower.y}
          heightM={tower.height_m}
        />
      ))}

      {/* Walkable Concourse & Gate Network Edges */}
      {topology.edges.map((edge) => {
        const from = nodeMap.get(edge.from_node);
        const to = nodeMap.get(edge.to_node);
        if (!from || !to) return null;
        return (
          <Line
            key={edge.id}
            points={[
              toThree(from.x, from.y, (from.z ?? 0) + 0.5),
              toThree(to.x, to.y, (to.z ?? 0) + 0.5),
            ]}
            color={edge.accessible === false ? "#a855f7" : "#0e7490"}
            lineWidth={1}
            transparent
            opacity={layerFilter === "waypoints" ? 0.25 : 0.42}
          />
        );
      })}

      {/* Stadium Nodes: Live Congestion Pillars, Exit Portals & Amenity Markers */}
      {topology.nodes.map((node) => {
        const telem = telemetryMap.get(node.id);
        const score = telem?.congestion_score ?? 0.3;
        const visuals = getCongestionVisuals(telem?.status ?? "optimal");
        const isExit =
          node.type === "gate" &&
          (node.gate_role === "exit" || node.gate_role === "entry_exit");
        const isGate = node.type === "gate";
        const isAmenity =
          node.type === "concession" ||
          node.type === "restroom" ||
          node.type === "medical";

        if (layerFilter === "exits" && !isGate) return null;
        if (layerFilter === "amenities" && !isAmenity) return null;

        const [nx, ny, nz] = toThree(node.x, node.y, node.z ?? 0);
        const pillarH = 3 + score * 16;
        const isSelected = selectedNodeId === node.id;
        const nodeColor =
          layerFilter === "exits" && isExit
            ? "#34d399"
            : visuals.hex;

        return (
          <group key={node.id} position={[nx, ny, nz]}>
            {/* Base Pedestal Ring */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.2, 0]}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode?.(node.id);
              }}
            >
              <ringGeometry args={[2.3, 3.6, 20]} />
              <meshBasicMaterial
                color={isSelected ? "#ffffff" : isExit ? "#34d399" : nodeColor}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Congestion Column */}
            <mesh
              position={[0, pillarH / 2 + 0.3, 0]}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode?.(node.id);
              }}
            >
              <cylinderGeometry args={[1.25, 1.85, pillarH, 12]} />
              <meshStandardMaterial
                color={nodeColor}
                emissive={nodeColor}
                emissiveIntensity={isSelected ? 1.6 : 0.75 + score * 0.8}
                transparent
                opacity={0.78}
              />
            </mesh>

            {/* Dedicated EXIT Arch Ring on Exit-Capable Gates */}
            {isExit && (
              <mesh position={[0, 3.6, 0]}>
                <torusGeometry args={[4.2, 0.45, 8, 24, Math.PI]} />
                <meshStandardMaterial
                  color="#34d399"
                  emissive="#10b981"
                  emissiveIntensity={1.6}
                />
              </mesh>
            )}

            {showLabels && (isGate || isSelected || layerFilter === "amenities") && (
              <Html center distanceFactor={215} position={[0, pillarH + 3.6, 0]}>
                <div
                  className={`pointer-events-none whitespace-nowrap rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
                    isExit
                      ? "border-emerald-400/70 bg-emerald-950/90 text-emerald-200"
                      : "border-slate-600 bg-slate-950/85 text-slate-200"
                  }`}
                >
                  {isExit ? "EXIT • " : isGate ? "ENTRY • " : ""}
                  {node.stand_code ?? node.name.split(" (")[0]}{" "}
                  {telem ? `(${telem.estimated_wait_min}m)` : ""}
                </div>
              </Html>
            )}
          </group>
        );
      })}

      {/* Floating 3D Incident Beacons */}
      {layerFilter !== "exits" &&
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
          <mesh key={`fan_${fan.snapped_node_id}_${idx}`} position={[fx, fy + 2.2, fz]}>
            <sphereGeometry args={[1.45, 10, 10]} />
            <meshStandardMaterial
              color="#67e8f9"
              emissive="#06b6d4"
              emissiveIntensity={1.5}
            />
          </mesh>
        );
      })}

      {/* Detected Seat Marker */}
      {seatLocation && (
        <SeatMarker3D seat={seatLocation} showLabel={showLabels} />
      )}

      {/* Exact User Location Marker */}
      {userPosition && (
        <UserLocationMarker position={userPosition} showLabel={showLabels} />
      )}

      {/* Game-Style Animated 3D Waypoints */}
      {showWaypoints && guidance && guidance.waypoints_3d.length > 0 && (
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
