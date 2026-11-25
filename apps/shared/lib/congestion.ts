import type {
  AlertIncident,
  CongestionLevel,
  EventPhase,
  IncidentSeverity,
  IncidentStatus,
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
    bgClass: "bg-emerald-500/15",
    textClass: "text-emerald-300",
    borderClass: "border-emerald-500/40",
  },
  moderate: {
    label: "Moderate",
    hex: "#f59e0b",
    bgClass: "bg-amber-500/15",
    textClass: "text-amber-300",
    borderClass: "border-amber-500/40",
  },
  high: {
    label: "High",
    hex: "#f97316",
    bgClass: "bg-orange-500/15",
    textClass: "text-orange-300",
    borderClass: "border-orange-500/40",
  },
  critical: {
    label: "Critical",
    hex: "#ef4444",
    bgClass: "bg-red-500/20",
    textClass: "text-red-300",
    borderClass: "border-red-500/50",
  },
  closed: {
    label: "Closed",
    hex: "#71717a",
    bgClass: "bg-zinc-600/20",
    textClass: "text-zinc-300",
    borderClass: "border-zinc-500/40",
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
      return "bg-red-500/20 text-red-300 border-red-500/50";
    case "high":
      return "bg-orange-500/20 text-orange-300 border-orange-500/50";
    case "medium":
      return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    case "low":
      return "bg-sky-500/20 text-sky-300 border-sky-500/40";
  }
}

export function getIncidentStatusClass(status: IncidentStatus): string {
  switch (status) {
    case "open":
      return "bg-red-500/15 text-red-300 border-red-500/40";
    case "acknowledged":
      return "bg-amber-500/15 text-amber-300 border-amber-500/40";
    case "dispatched":
      return "bg-teal-500/15 text-teal-300 border-teal-500/40";
    case "resolved":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
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

export function toSvgPoint(x: number, y: number): { sx: number; sy: number } {
  if (Math.abs(x) <= 220 && Math.abs(y) <= 220) {
    return {
      sx: Number((500 + x * 2.65).toFixed(1)),
      sy: Number((500 - y * 2.65).toFixed(1)),
    };
  }
  return { sx: x, sy: y };
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
