"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Send, ShieldAlert, Siren } from "lucide-react";
import type {
  AlertIncident,
  IncidentStatus,
  StadiumTopology,
} from "@shared/types/contracts";
import {
  formatRelativeSeconds,
  getIncidentStatusClass,
  getSeverityBadgeClass,
  sortIncidentsByPriority,
} from "@shared/lib/congestion";

interface IncidentFeedProps {
  topology: StadiumTopology;
  incidents: AlertIncident[];
  onUpdateStatus: (
    incidentId: string,
    status: IncidentStatus,
    assignedTeam?: string
  ) => Promise<void>;
  onFocusNode: (nodeId: string) => void;
}

const TEAMS = [
  "Gate Alpha Squad",
  "Crowd Flow Unit",
  "Facilities Crew 2",
  "Med Response West",
  "Security Ops",
];

export function IncidentFeed({
  topology,
  incidents,
  onUpdateStatus,
  onFocusNode,
}: IncidentFeedProps) {
  const [selectedTeams, setSelectedTeams] = useState<Record<string, string>>(
    {}
  );
  const [showResolved, setShowResolved] = useState(false);

  const nodeNames = useMemo(
    () => new Map(topology.nodes.map((n) => [n.id, n.name])),
    [topology.nodes]
  );

  const sorted = useMemo(() => {
    const ordered = sortIncidentsByPriority(incidents);
    return showResolved
      ? ordered
      : ordered.filter((inc) => inc.status !== "resolved");
  }, [incidents, showResolved]);

  return (
    <section className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/90 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Siren className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">
            Incident Alert Feed (WS /ws/ops)
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:text-white"
        >
          {showResolved ? "Hide Resolved" : "Show Resolved"}
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-0.5">
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-xs text-zinc-400">
            No active operational incidents. All stadium zones within nominal thresholds.
          </div>
        ) : (
          sorted.map((inc) => {
            const teamValue =
              selectedTeams[inc.incident_id] ?? inc.assigned_team ?? TEAMS[0];
            return (
              <article
                key={inc.incident_id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/85 p-3.5 transition hover:border-zinc-700"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${getSeverityBadgeClass(
                        inc.severity
                      )}`}
                    >
                      {inc.severity}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${getIncidentStatusClass(
                        inc.status
                      )}`}
                    >
                      {inc.status}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {formatRelativeSeconds(inc.created_at)}
                    </span>
                  </div>
                  {inc.confidence !== undefined && (
                    <span className="text-[11px] text-zinc-400">
                      Conf: {Math.round(inc.confidence * 100)}%
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onFocusNode(inc.node_id)}
                  className="text-left text-sm font-semibold text-white hover:text-teal-300"
                >
                  {inc.title}
                </button>
                <p className="mt-1 text-xs text-zinc-400">{inc.description}</p>

                <div className="mt-2 rounded-lg border border-teal-500/25 bg-teal-500/10 px-2.5 py-1.5 text-xs text-teal-200">
                  <span className="font-semibold">Action: </span>
                  {inc.recommended_action}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                  <span>
                    Zone:{" "}
                    <button
                      type="button"
                      onClick={() => onFocusNode(inc.node_id)}
                      className="font-medium text-cyan-300 underline-offset-2 hover:underline"
                    >
                      {nodeNames.get(inc.node_id) ?? inc.node_id}
                    </button>
                  </span>
                  {inc.assigned_team && (
                    <span className="text-zinc-300">
                      Team: <strong>{inc.assigned_team}</strong>
                    </span>
                  )}
                </div>

                {inc.status !== "resolved" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800/80 pt-2.5">
                    <select
                      aria-label="Assign response team"
                      value={teamValue}
                      onChange={(e) =>
                        setSelectedTeams((prev) => ({
                          ...prev,
                          [inc.incident_id]: e.target.value,
                        }))
                      }
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                    >
                      {TEAMS.map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>

                    {inc.status === "open" && (
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdateStatus(inc.incident_id, "acknowledged")
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/25"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Acknowledge
                      </button>
                    )}

                    {(inc.status === "open" ||
                      inc.status === "acknowledged") && (
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdateStatus(
                            inc.incident_id,
                            "dispatched",
                            teamValue
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-teal-500/40 bg-teal-500/20 px-2.5 py-1 text-xs font-medium text-teal-200 hover:bg-teal-500/30"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Dispatch
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        void onUpdateStatus(
                          inc.incident_id,
                          "resolved",
                          teamValue
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Resolve
                    </button>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
