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
    <section className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Siren className="h-4 w-4 text-red-600" />
          <h2 className="text-sm font-semibold text-slate-900">
            Incident Alert Feed (WS /ws/ops)
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
        >
          {showResolved ? "Hide Resolved" : "Show Resolved"}
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-0.5">
        {sorted.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
            No active operational incidents. All stadium zones within nominal thresholds.
          </div>
        ) : (
          sorted.map((inc) => {
            const teamValue =
              selectedTeams[inc.incident_id] ?? inc.assigned_team ?? TEAMS[0];
            return (
              <article
                key={inc.incident_id}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 transition hover:border-slate-300"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${getSeverityBadgeClass(
                        inc.severity
                      )}`}
                    >
                      {inc.severity}
                    </span>
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${getIncidentStatusClass(
                        inc.status
                      )}`}
                    >
                      {inc.status}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {formatRelativeSeconds(inc.created_at)}
                    </span>
                  </div>
                  {inc.confidence !== undefined && (
                    <span className="text-[11px] text-slate-500">
                      Conf: {Math.round(inc.confidence * 100)}%
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onFocusNode(inc.node_id)}
                  className="text-left text-sm font-semibold text-slate-900 hover:text-blue-700"
                >
                  {inc.title}
                </button>
                <p className="mt-1 text-xs text-slate-600">{inc.description}</p>

                <div className="mt-2 rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs text-blue-900">
                  <span className="font-semibold">Action: </span>
                  {inc.recommended_action}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>
                    Zone:{" "}
                    <button
                      type="button"
                      onClick={() => onFocusNode(inc.node_id)}
                      className="font-medium text-blue-700 underline-offset-2 hover:underline"
                    >
                      {nodeNames.get(inc.node_id) ?? inc.node_id}
                    </button>
                  </span>
                  {inc.assigned_team && (
                    <span className="text-slate-700">
                      Team: <strong>{inc.assigned_team}</strong>
                    </span>
                  )}
                </div>

                {inc.status !== "resolved" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2.5">
                    <select
                      aria-label="Assign response team"
                      value={teamValue}
                      onChange={(e) =>
                        setSelectedTeams((prev) => ({
                          ...prev,
                          [inc.incident_id]: e.target.value,
                        }))
                      }
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
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
                        className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
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
                        className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
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
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
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
