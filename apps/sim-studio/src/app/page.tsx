"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Flame,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Zap,
} from "lucide-react";
import { useOpsStream } from "@shared/hooks/useOpsStream";
import {
  applySimulationPreset,
  controlBottleneck,
  createIncident,
  resetSimulationState,
  setSimulationPhase,
  triggerDemoStep,
} from "@shared/lib/apiClient";
import { formatEventPhase, getCongestionVisuals } from "@shared/lib/congestion";
import type {
  EventPhase,
  IncidentCategory,
  IncidentSeverity,
} from "@shared/types/contracts";

const StadiumHologram3D = dynamic(
  () =>
    import("@shared/components/StadiumHologram3D").then(
      (mod) => mod.StadiumHologram3D
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[500px] items-center justify-center rounded-2xl border border-amber-500/30 bg-[#030816] text-xs font-medium text-amber-300">
        Initializing M. Chinnaswamy 3D Simulator Canvas...
      </div>
    ),
  }
);

const PRESETS: {
  id:
    | "normal_flow"
    | "gate1_rush"
    | "halftime_concession_spike"
    | "medical_emergency_east"
    | "post_match_egress";
  label: string;
}[] = [
  { id: "normal_flow", label: "Normal Flow" },
  { id: "gate1_rush", label: "Gate 1 Surge" },
  { id: "halftime_concession_spike", label: "Halftime Food Spike" },
  { id: "medical_emergency_east", label: "Medical Alert (East)" },
  { id: "post_match_egress", label: "Post-Match Egress" },
];

const PHASES: EventPhase[] = [
  "pre_event_ingress",
  "in_play",
  "halftime_surge",
  "egress",
  "idle",
];

const CATEGORIES: IncidentCategory[] = [
  "queue_surge",
  "crowd_bottleneck",
  "medical",
  "security",
  "facility_fault",
];

const SEVERITIES: IncidentSeverity[] = ["low", "medium", "high", "critical"];

export default function SimulatorStudioPage() {
  const {
    topology,
    telemetry,
    incidents,
    activeFans,
    connectionStatus,
    refreshNow,
  } = useOpsStream();

  const [selectedNodeId, setSelectedNodeId] = useState<string>("gate_1_cubbon");
  const [severityPct, setSeverityPct] = useState<number>(92);
  const [category, setCategory] = useState<IncidentCategory>("crowd_bottleneck");
  const [incidentSeverity, setIncidentSeverity] =
    useState<IncidentSeverity>("high");
  const [customTitle, setCustomTitle] = useState<string>("");
  const [customAction, setCustomAction] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const selectedNode = useMemo(
    () => topology.nodes.find((n) => n.id === selectedNodeId) ?? topology.nodes[0],
    [topology.nodes, selectedNodeId]
  );

  const telemetryMap = useMemo(
    () => new Map(telemetry.nodes.map((n) => [n.node_id, n])),
    [telemetry.nodes]
  );

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refreshNow();
      setStatusToast(`Live update pushed: ${label}`);
    } catch (err) {
      setStatusToast(
        err instanceof Error
          ? `Backend unreachable (${err.message}). Start backend on :8000.`
          : "Action failed."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleInjectCongestion = () => {
    if (!selectedNode) return;
    void runAction(
      `Injected ${severityPct}% congestion at ${selectedNode.name}`,
      () =>
        controlBottleneck({
          node_id: selectedNode.id,
          severity: Number((severityPct / 100).toFixed(2)),
          clear: false,
        })
    );
  };

  const handleClearCongestion = () => {
    if (!selectedNode) return;
    void runAction(`Cleared congestion at ${selectedNode.name}`, () =>
      controlBottleneck({ node_id: selectedNode.id, clear: true })
    );
  };

  const handleTriggerIncident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode) return;
    const title =
      customTitle.trim() ||
      `Simulated ${category.replace("_", " ")} at ${selectedNode.name}`;
    const action =
      customAction.trim() ||
      `Dispatch response team to ${selectedNode.name} and reroute fans via 3D waypoints.`;

    void runAction(`Triggered ${incidentSeverity} ${category} at ${selectedNode.name}`, () =>
      createIncident({
        category,
        severity: incidentSeverity,
        node_id: selectedNode.id,
        title,
        description: `Behind-the-scenes simulation event triggered at ${selectedNode.name} (Level ${selectedNode.level}).`,
        recommended_action: action,
      })
    );
  };

  const selectedTelem = selectedNode ? telemetryMap.get(selectedNode.id) : undefined;
  const visuals = getCongestionVisuals(selectedTelem?.status ?? "optimal");
  const activeIncidents = incidents.filter((i) => i.status !== "resolved");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-amber-500/25 bg-slate-950/95 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/15 text-amber-300">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">
                D.I.S.H.A. Simulator Studio • Behind-the-Scenes Demo Control
              </h1>
              <p className="text-xs text-slate-400">
                Inject congestion &amp; incidents at any M. Chinnaswamy Stadium location — updates Ops (:3000) &amp; Fan (:3001) live.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                connectionStatus === "live"
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-amber-500/40 bg-amber-500/15 text-amber-300"
              }`}
            >
              Backend: {connectionStatus.toUpperCase()}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction("Advanced +1 tick", () => triggerDemoStep())}
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
            >
              <Play className="h-3.5 w-3.5" /> Step +1 Tick
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void runAction("Reset stadium baseline", () => resetSimulationState())
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Stadium
            </button>
          </div>
        </div>
      </header>

      {statusToast && (
        <div className="mx-auto max-w-[1600px] px-4 pt-3 sm:px-6">
          <div className="flex items-center justify-between rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-3.5 py-2 text-xs text-cyan-100">
            <span>{statusToast}</span>
            <button
              type="button"
              onClick={() => setStatusToast(null)}
              className="text-cyan-300 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-[1600px] gap-4 p-4 sm:p-6 xl:grid-cols-[1.45fr_1fr]">
        {/* Left: 3D Click-to-Target Stadium Map */}
        <div className="space-y-4">
          <StadiumHologram3D
            topology={topology}
            telemetry={telemetry}
            incidents={incidents}
            activeFans={activeFans}
            selectedNodeId={selectedNodeId}
            heightClassName="h-[460px] sm:h-[540px]"
            title="M. Chinnaswamy Stadium • Click Any Zone to Simulate Congestion/Events"
            onSelectNode={setSelectedNodeId}
          />

          {/* 1-Click Demo Scenarios + Phase Switcher */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
              <Zap className="h-4 w-4" />
              <span>1-Click Matchday Demo Scenarios</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(`Scenario: ${p.label}`, () =>
                      applySimulationPreset(p.id)
                    )
                  }
                  className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="pt-1">
              <span className="mb-1.5 block text-[11px] font-medium text-slate-400">
                Current Event Phase: <strong className="text-white">{formatEventPhase(telemetry.event_phase)}</strong>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PHASES.map((ph) => (
                  <button
                    key={ph}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void runAction(`Phase -> ${ph}`, () => setSimulationPhase(ph))
                    }
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      telemetry.event_phase === ph
                        ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                        : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {formatEventPhase(ph)}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Right: Target Location Congestion & Event Controls */}
        <div className="space-y-4">
          {/* Selected Location Picker + Congestion Injector */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-400" />
                <h2 className="text-sm font-semibold text-white">
                  Simulate Congestion at Any Location
                </h2>
              </div>
              {selectedTelem && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${visuals.bgClass} ${visuals.textClass} ${visuals.borderClass}`}
                >
                  {Math.round(selectedTelem.congestion_score * 100)}% {visuals.label}
                </span>
              )}
            </div>

            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-300">
                Target Stadium Location (or click directly on 3D map)
              </span>
              <select
                value={selectedNodeId}
                onChange={(e) => setSelectedNodeId(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
              >
                {topology.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name} (L{node.level} • {node.type})
                  </option>
                ))}
              </select>
            </label>

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-300">Simulated Congestion Level</span>
                <span className="font-bold text-amber-300">{severityPct}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={99}
                value={severityPct}
                onChange={(e) => setSeverityPct(Number(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleInjectCongestion}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-orange-400"
              >
                <Activity className="h-3.5 w-3.5" /> Inject Congestion
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleClearCongestion}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Clear Congestion
              </button>
            </div>
          </section>

          {/* Unusual Activity / Incident Injector */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-white">
                Trigger Incident / Unusual Activity
              </h2>
            </div>

            <form onSubmit={handleTriggerIncident} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">
                  <span className="mb-1 block text-slate-400">Category</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as IncidentCategory)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs">
                  <span className="mb-1 block text-slate-400">Severity</span>
                  <select
                    value={incidentSeverity}
                    onChange={(e) =>
                      setIncidentSeverity(e.target.value as IncidentSeverity)
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder={`Title (default: Simulated ${category} at ${selectedNode?.name ?? ""})`}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500"
              />

              <input
                type="text"
                value={customAction}
                onChange={(e) => setCustomAction(e.target.value)}
                placeholder="Recommended action for Ops & Fan rerouting (optional)"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500"
              />

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-500 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-red-400"
              >
                <AlertTriangle className="h-4 w-4" /> Trigger 3D Incident Beacon
              </button>
            </form>
          </section>

          {/* Active Incidents Summary */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Active Incidents in Stadium ({activeIncidents.length})
            </h3>
            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {activeIncidents.map((inc) => (
                <button
                  key={inc.incident_id}
                  type="button"
                  onClick={() => setSelectedNodeId(inc.node_id)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/75 px-3 py-2 text-left text-xs hover:border-slate-600"
                >
                  <span className="truncate font-medium text-slate-100">
                    {inc.title}
                  </span>
                  <span className="ml-2 shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-300">
                    {inc.severity}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
