"use client";

import type {
  NodeTelemetry,
  StadiumTopology,
  StandSector,
} from "../types/contracts";
import { getCongestionVisuals, SVG_SCALE, toSvgPoint } from "../lib/congestion";

interface StadiumMap2DBaseProps {
  topology: StadiumTopology;
  telemetryMap: Map<string, NodeTelemetry>;
  activeLevel: number | "all";
  selectedNodeId?: string | null;
  showStandLabels?: boolean;
  onSelectStandNode?: (nodeId: string) => void;
}

function buildStandSectorPath(sector: StandSector): string {
  const startRad = (sector.start_deg * Math.PI) / 180;
  const endRad = (sector.end_deg * Math.PI) / 180;
  const rIn = sector.inner_radius_m * SVG_SCALE;
  const rOut = sector.outer_radius_m * SVG_SCALE;

  const x1 = 500 + Math.cos(startRad) * rIn;
  const y1 = 500 - Math.sin(startRad) * rIn;
  const x2 = 500 + Math.cos(startRad) * rOut;
  const y2 = 500 - Math.sin(startRad) * rOut;
  const x3 = 500 + Math.cos(endRad) * rOut;
  const y3 = 500 - Math.sin(endRad) * rOut;
  const x4 = 500 + Math.cos(endRad) * rIn;
  const y4 = 500 - Math.sin(endRad) * rIn;

  const largeArc = Math.abs(sector.end_deg - sector.start_deg) > 180 ? 1 : 0;
  // Because SVG y is inverted relative to math sin(theta), positive delta angle sweeps CCW (sweep=0)
  const sweepOuter = sector.end_deg >= sector.start_deg ? 0 : 1;
  const sweepInner = sweepOuter === 0 ? 1 : 0;

  return [
    `M ${x1.toFixed(1)} ${y1.toFixed(1)}`,
    `L ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    `A ${rOut.toFixed(1)} ${rOut.toFixed(1)} 0 ${largeArc} ${sweepOuter} ${x3.toFixed(1)} ${y3.toFixed(1)}`,
    `L ${x4.toFixed(1)} ${y4.toFixed(1)}`,
    `A ${rIn.toFixed(1)} ${rIn.toFixed(1)} 0 ${largeArc} ${sweepInner} ${x1.toFixed(1)} ${y1.toFixed(1)}`,
    "Z",
  ].join(" ");
}

export function StadiumMap2DBase({
  topology,
  telemetryMap,
  activeLevel,
  selectedNodeId,
  showStandLabels = true,
  onSelectStandNode,
}: StadiumMap2DBaseProps) {
  const spec = topology.hologram_spec;
  const fieldR = (spec?.field_radius_m ?? 68) * SVG_SCALE;
  const outerCanopyR = (spec?.canopy_ring?.outer_radius_m ?? 132) * SVG_SCALE;
  const innerBowlR = (spec?.tier_rings?.[0]?.inner_radius_m ?? 72) * SVG_SCALE;
  const pitchHalfH = ((spec?.pitch_length_m ?? 20.12) * SVG_SCALE) / 2;

  return (
    <g>
      {/* Subtle Blueprint Grid */}
      <defs>
        <pattern
          id="disha-grid-2d"
          width="50"
          height="50"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 50 0 L 0 0 0 50"
            fill="none"
            stroke="#0f172a"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect x="0" y="0" width="1000" height="1000" fill="url(#disha-grid-2d)" />

      {/* Outer Road & Plaza Perimeter */}
      <circle
        cx="500"
        cy="500"
        r={outerCanopyR + 36}
        fill="none"
        stroke="#1e293b"
        strokeWidth="2"
        strokeDasharray="10 8"
      />
      <circle
        cx="500"
        cy="500"
        r={outerCanopyR}
        fill="#071022"
        fillOpacity="0.85"
        stroke="#1e3a5f"
        strokeWidth="2"
      />

      {/* Stand Sectors (M. Chinnaswamy real curved stand geometry) */}
      {(spec?.stand_sectors ?? []).map((sector) => {
        const t = telemetryMap.get(sector.linked_node_id);
        const visuals = getCongestionVisuals(t?.status ?? "optimal");
        const isLevelMatch =
          activeLevel === "all" || sector.level === activeLevel;
        const isSelected = selectedNodeId === sector.linked_node_id;
        const midRad = (((sector.start_deg + sector.end_deg) / 2) * Math.PI) / 180;
        const midR = ((sector.inner_radius_m + sector.outer_radius_m) / 2) * SVG_SCALE;
        const lx = 500 + Math.cos(midRad) * midR;
        const ly = 500 - Math.sin(midRad) * midR;
        const shortName = sector.name.split("(")[0].trim();

        return (
          <g
            key={sector.id}
            className={onSelectStandNode ? "cursor-pointer" : undefined}
            onClick={(e) => {
              if (!onSelectStandNode) return;
              e.stopPropagation();
              onSelectStandNode(sector.linked_node_id);
            }}
          >
            <path
              d={buildStandSectorPath(sector)}
              fill={visuals.hex}
              fillOpacity={isLevelMatch ? 0.16 : 0.05}
              stroke={isSelected ? "#38bdf8" : visuals.hex}
              strokeOpacity={isSelected ? 0.95 : isLevelMatch ? 0.5 : 0.18}
              strokeWidth={isSelected ? 3 : 1.5}
            />
            {showStandLabels && (
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={isLevelMatch ? "#94a3b8" : "#475569"}
                fontSize="11"
                fontWeight="600"
                pointerEvents="none"
              >
                {shortName}
              </text>
            )}
          </g>
        );
      })}

      {/* Inner Bowl Boundary & Outfield */}
      <circle
        cx="500"
        cy="500"
        r={innerBowlR}
        fill="none"
        stroke="#0e7490"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
      <circle
        cx="500"
        cy="500"
        r={fieldR}
        fill="#052e23"
        fillOpacity="0.6"
        stroke="#10b981"
        strokeOpacity="0.55"
        strokeWidth="2.5"
      />
      {/* 30-yard inner cricket circle */}
      <circle
        cx="500"
        cy="500"
        r={fieldR * 0.44}
        fill="none"
        stroke="#34d399"
        strokeOpacity="0.3"
        strokeWidth="1.5"
        strokeDasharray="6 6"
      />

      {/* Cricket Pitch */}
      <rect
        x={500 - 8}
        y={500 - pitchHalfH}
        width="16"
        height={pitchHalfH * 2}
        rx="2"
        fill="#d6b37c"
        fillOpacity="0.38"
        stroke="#fcd34d"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />

      {/* End Labels */}
      {spec?.ends && (
        <>
          <text
            x="500"
            y={500 - fieldR + 24}
            textAnchor="middle"
            fill="#6ee7b7"
            fillOpacity="0.7"
            fontSize="11"
            fontWeight="600"
            letterSpacing="1"
            pointerEvents="none"
          >
            {spec.ends.north_end.toUpperCase()}
          </text>
          <text
            x="500"
            y={500 + fieldR - 14}
            textAnchor="middle"
            fill="#6ee7b7"
            fillOpacity="0.7"
            fontSize="11"
            fontWeight="600"
            letterSpacing="1"
            pointerEvents="none"
          >
            {spec.ends.south_end.toUpperCase()}
          </text>
        </>
      )}

      {/* Floodlight Towers */}
      {(spec?.floodlight_towers ?? []).map((tower) => {
        const { sx, sy } = toSvgPoint(tower.x, tower.y);
        return (
          <g key={tower.id} pointerEvents="none">
            <circle
              cx={sx}
              cy={sy}
              r="8"
              fill="#0f172a"
              stroke="#38bdf8"
              strokeWidth="1.5"
            />
            <circle cx={sx} cy={sy} r="3" fill="#7dd3fc" />
          </g>
        );
      })}

      {/* Perimeter Roads */}
      {(spec?.perimeter_roads ?? []).map((road) => {
        const { sx, sy } = toSvgPoint(road.label_x, road.label_y);
        const clampedX = Math.max(115, Math.min(885, sx));
        const clampedY = Math.max(24, Math.min(980, sy));
        return (
          <g key={road.name} pointerEvents="none">
            <rect
              x={clampedX - 72}
              y={clampedY - 12}
              width="144"
              height="22"
              rx="11"
              fill="#0f172a"
              fillOpacity="0.9"
              stroke="#334155"
              strokeWidth="1"
            />
            <text
              x={clampedX}
              y={clampedY + 3}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="10.5"
              fontWeight="600"
              letterSpacing="0.8"
            >
              {road.name.toUpperCase()}
            </text>
          </g>
        );
      })}
    </g>
  );
}
