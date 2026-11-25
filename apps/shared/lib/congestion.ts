import type {
  AlertIncident,
  CongestionLevel,
  EventPhase,
  IncidentSeverity,
  IncidentStatus,
  NodeTelemetry,
} from "../types/contracts";

export interface CongestionVisuals {
  label: string;
  hex: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

const STATUS_VISUALS: Record<CongestionLevel, CongestionVisuals> = {
  optimal: {
    label: "Optimal",
    hex: "#10b981",
    bgClass: "bg-emerald-50",
    textClass: "text-emerald-700",
    borderClass: "border-emerald-200",
  },
  moderate: {
    label: "Moderate",
    hex: "#f59e0b",
    bgClass: "bg-amber-50",
    textClass: "text-amber-700",
    borderClass: "border-amber-200",
  },
  high: {
    label: "High",
    hex: "#f97316",
    bgClass: "bg-orange-50",
    textClass: "text-orange-700",
    borderClass: "border-orange-200",
  },
  critical: {
    label: "Critical",
    hex: "#ef4444",
    bgClass: "bg-red-50",
    textClass: "text-red-700",
    borderClass: "border-red-200",
  },
  closed: {
    label: "Closed",
    hex: "#71717a",
    bgClass: "bg-slate-100",
    textClass: "text-slate-700",
    borderClass: "border-slate-300",
  },
};

export function getCongestionVisuals(
  status: CongestionLevel
): CongestionVisuals {
  return STATUS_VISUALS[status] ?? STATUS_VISUALS.moderate;
}

export function scoreToCongestionLevel(score: number): CongestionLevel {
  if (score >= 0.8) return "critical";
  if (score >= 0.6) return "high";
  if (score >= 0.35) return "moderate";
  return "optimal";
}

export function getSeverityBadgeClass(severity: IncidentSeverity): string {
  switch (severity) {
    case "critical":
      return "bg-red-50 text-red-700 border-red-200";
    case "high":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "medium":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "low":
      return "bg-sky-50 text-sky-700 border-sky-200";
  }
}

export function getIncidentStatusClass(status: IncidentStatus): string {
  switch (status) {
    case "open":
      return "bg-red-50 text-red-700 border-red-200";
    case "acknowledged":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "dispatched":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "resolved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
}

export function formatEventPhase(phase: EventPhase): string {
  switch (phase) {
    case "pre_event_ingress":
      return "Pre-Event Ingress";
    case "in_play":
      return "In Play";
    case "halftime_surge":
      return "Halftime Surge";
    case "egress":
      return "Post-Event Egress";
    case "idle":
      return "Idle";
  }
}

export function formatRelativeSeconds(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "Waiting...";
  const diffSec = Math.max(
    0,
    Math.round((Date.now() - new Date(isoTimestamp).getTime()) / 1000)
  );
  if (diffSec < 5) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  return `${mins}m ago`;
}

export const SVG_SCALE = 2.65;

export function toSvgPoint(x: number, y: number): { sx: number; sy: number } {
  if (Math.abs(x) <= 220 && Math.abs(y) <= 220) {
    return {
      sx: Number((500 + x * SVG_SCALE).toFixed(1)),
      sy: Number((500 - y * SVG_SCALE).toFixed(1)),
    };
  }
  return { sx: x, sy: y };
}

export function fromSvgPoint(sx: number, sy: number): { x: number; y: number } {
  return {
    x: Number(((sx - 500) / SVG_SCALE).toFixed(1)),
    y: Number(((500 - sy) / SVG_SCALE).toFixed(1)),
  };
}

export interface CrowdAnomalyInfo {
  isUnusual: boolean;
  reason: string;
  level: "critical" | "elevated" | "normal";
}

export function evaluateCrowdAnomaly(
  telemetry: NodeTelemetry | undefined,
  activeIncidentCount: number
): CrowdAnomalyInfo {
  if (!telemetry) {
    return { isUnusual: false, reason: "Nominal", level: "normal" };
  }
  const score = telemetry.congestion_score;
  const pulse = telemetry.pulse_intensity ?? score;
  if (score >= 0.8 || activeIncidentCount > 0 || pulse >= 0.85) {
    return {
      isUnusual: true,
      reason:
        activeIncidentCount > 0
          ? "Active Crowd Incident"
          : `Critical Crowd Gathering (${Math.round(score * 100)}%)`,
      level: "critical",
    };
  }
  if (
    score >= 0.68 ||
    (telemetry.trend === "rising" && score >= 0.56)
  ) {
    return {
      isUnusual: true,
      reason:
        telemetry.trend === "rising"
          ? `Rapidly Gathering (${Math.round(score * 100)}% ↑)`
          : `Unusual Density (${Math.round(score * 100)}%)`,
      level: "elevated",
    };
  }
  return { isUnusual: false, reason: "Normal flow", level: "normal" };
}

export function sortIncidentsByPriority(
  incidents: AlertIncident[]
): AlertIncident[] {
  const statusRank: Record<IncidentStatus, number> = {
    open: 0,
    acknowledged: 1,
    dispatched: 2,
    resolved: 3,
  };
  const severityRank: Record<IncidentSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return [...incidents].sort((a, b) => {
    const sDiff = statusRank[a.status] - statusRank[b.status];
    if (sDiff !== 0) return sDiff;
    const sevDiff = severityRank[a.severity] - severityRank[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
