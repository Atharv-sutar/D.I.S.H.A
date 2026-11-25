"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AlertIncident,
  IncidentStatus,
  StadiumTopology,
  TelemetrySnapshot,
  UserPosition3D,
} from "../types/contracts";
import type {
  ConnectionStatus,
  DataSourceMode,
  OpsWsEnvelope,
} from "../types/ws";
import {
  controlBottleneck,
  createIncident,
  fetchActiveFans,
  fetchIncidents,
  fetchLatestTelemetry,
  fetchVenueTopology,
  getWsOpsUrl,
  patchIncident,
} from "../lib/apiClient";
import { scoreToCongestionLevel } from "../lib/congestion";
import {
  createInitialIncidents,
  createInitialTelemetry,
  MOCK_TOPOLOGY,
} from "../mock/stadiumData";
import {
  maybeGenerateMockIncident,
  tickTelemetrySnapshot,
} from "../mock/simulator";

export interface UseOpsStreamResult {
  topology: StadiumTopology;
  telemetry: TelemetrySnapshot;
  incidents: AlertIncident[];
  activeFans: UserPosition3D[];
  mode: DataSourceMode;
  setMode: (mode: DataSourceMode) => void;
  simPaused: boolean;
  setSimPaused: (paused: boolean) => void;
  connectionStatus: ConnectionStatus;
  lastUpdatedAt: string | null;
  isStale: boolean;
  updateIncidentStatus: (
    incidentId: string,
    status: IncidentStatus,
    assignedTeam?: string
  ) => Promise<void>;
  simulateCrowdSurge: (nodeId: string, severity?: number) => Promise<void>;
  clearCrowdSurge: (nodeId: string) => Promise<void>;
  refreshNow: () => Promise<void>;
}

export function useOpsStream(): UseOpsStreamResult {
  const [topology, setTopology] = useState<StadiumTopology>(MOCK_TOPOLOGY);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(() =>
    createInitialTelemetry()
  );
  const [incidents, setIncidents] = useState<AlertIncident[]>(() =>
    createInitialIncidents()
  );
  const [activeFans, setActiveFans] = useState<UserPosition3D[]>([
    {
      x: -110,
      y: 122,
      z: 0,
      level: 0,
      heading_deg: 135,
      snapped_node_id: "transit_cubbon_park_metro",
    },
    {
      x: 4,
      y: 78,
      z: 6.5,
      level: 1,
      heading_deg: 180,
      snapped_node_id: "stand_e_lower",
    },
  ]);
  const [mode, setMode] = useState<DataSourceMode>("auto");
  const [simPaused, setSimPaused] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(() =>
    new Date().toISOString()
  );
  const [isStale, setIsStale] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const topologyRef = useRef(topology);
  topologyRef.current = topology;

  const startSimulationMode = useCallback(() => {
    setConnectionStatus("simulation");
    setLastUpdatedAt(new Date().toISOString());
  }, []);

  const connectLive = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (mode === "simulation") {
      startSimulationMode();
      return;
    }

    setConnectionStatus("connecting");
    try {
      const [topo, snap, incs, fans] = await Promise.all([
        fetchVenueTopology(),
        fetchLatestTelemetry(),
        fetchIncidents(),
        fetchActiveFans().catch(() => []),
      ]);
      setTopology(topo);
      setTelemetry(snap);
      setIncidents(incs);
      if (fans.length > 0) {
        setActiveFans(fans.map((f) => f.user_position));
      }
      setLastUpdatedAt(snap.timestamp || new Date().toISOString());
    } catch {
      if (mode === "live") {
        setConnectionStatus("offline");
        return;
      }
      startSimulationMode();
      return;
    }

    try {
      const ws = new WebSocket(getWsOpsUrl());
      wsRef.current = ws;
      ws.onopen = () => setConnectionStatus("live");
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as OpsWsEnvelope;
          setLastUpdatedAt(msg.timestamp || new Date().toISOString());
          if (msg.event === "telemetry_update") {
            setTelemetry(msg.payload);
          } else if (msg.event === "incident_created") {
            setIncidents((prev) => [
              msg.payload,
              ...prev.filter((i) => i.incident_id !== msg.payload.incident_id),
            ]);
          } else if (msg.event === "incident_updated") {
            setIncidents((prev) =>
              prev.map((i) =>
                i.incident_id === msg.payload.incident_id ? msg.payload : i
              )
            );
          }
        } catch {
          // Ignore malformed WS frame
        }
      };
      ws.onerror = () => {
        if (mode === "auto") {
          startSimulationMode();
        } else {
          setConnectionStatus("offline");
        }
      };
      ws.onclose = () => {
        if (mode === "auto") {
          startSimulationMode();
        }
      };
    } catch {
      startSimulationMode();
    }
  }, [mode, startSimulationMode]);

  useEffect(() => {
    void connectLive();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connectLive]);

  // Simulation tick loop when in simulation mode
  useEffect(() => {
    if (connectionStatus !== "simulation" || simPaused) return;
    const timer = setInterval(() => {
      setTelemetry((prev) => {
        const next = tickTelemetrySnapshot(prev, topologyRef.current);
        setLastUpdatedAt(next.timestamp);
        if (Math.random() < 0.25) {
          setIncidents((prevIncs) => {
            const generated = maybeGenerateMockIncident(
              next,
              topologyRef.current,
              prevIncs
            );
            return generated ? [generated, ...prevIncs] : prevIncs;
          });
        }
        return next;
      });
    }, 3000);

    return () => clearInterval(timer);
  }, [connectionStatus, simPaused]);

  // Stale telemetry detector (> 12s without fresh update)
  useEffect(() => {
    const checker = setInterval(() => {
      if (!lastUpdatedAt) {
        setIsStale(true);
        return;
      }
      const ageMs = Date.now() - new Date(lastUpdatedAt).getTime();
      setIsStale(ageMs > 12000);
    }, 2000);
    return () => clearInterval(checker);
  }, [lastUpdatedAt]);

  const updateIncidentStatus = useCallback(
    async (
      incidentId: string,
      status: IncidentStatus,
      assignedTeam?: string
    ) => {
      const updatedAt = new Date().toISOString();
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.incident_id === incidentId
            ? {
                ...inc,
                status,
                assigned_team: assignedTeam ?? inc.assigned_team,
                updated_at: updatedAt,
              }
            : inc
        )
      );

      if (connectionStatus === "live") {
        try {
          const confirmed = await patchIncident(incidentId, {
            status,
            assigned_team: assignedTeam,
          });
          setIncidents((prev) =>
            prev.map((inc) =>
              inc.incident_id === incidentId ? confirmed : inc
            )
          );
        } catch {
          // Keep optimistic state if backend call fails transiently
        }
      }
    },
    [connectionStatus]
  );

  const simulateCrowdSurge = useCallback(
    async (nodeId: string, severity = 0.91) => {
      const nodeMeta = topologyRef.current.nodes.find((n) => n.id === nodeId);
      const label = nodeMeta?.name ?? nodeId;
      const now = new Date().toISOString();

      setTelemetry((prev) => ({
        ...prev,
        timestamp: now,
        nodes: prev.nodes.map((n) =>
          n.node_id === nodeId
            ? {
                ...n,
                congestion_score: severity,
                occupancy: Math.round(n.capacity * Math.min(0.98, severity)),
                queue_length: Math.max(n.queue_length, Math.round(severity * 175)),
                estimated_wait_min: Number((severity * 16.5).toFixed(1)),
                flow_rate_per_min: Math.max(8, Math.round(n.flow_rate_per_min * 0.45)),
                trend: "rising",
                pulse_intensity: 1,
                status: scoreToCongestionLevel(severity),
              }
            : n
        ),
      }));
      setLastUpdatedAt(now);

      const newIncident: AlertIncident = {
        incident_id: `inc_sim_${Date.now().toString().slice(-5)}`,
        venue_id: topologyRef.current.venue_id,
        created_at: now,
        category: "crowd_bottleneck",
        severity: severity >= 0.85 ? "critical" : "high",
        status: "open",
        node_id: nodeId,
        position: {
          x: nodeMeta?.x ?? 0,
          y: nodeMeta?.y ?? 0,
          z: nodeMeta?.z ?? 0,
          level: nodeMeta?.level ?? 0,
        },
        title: `Unusual Crowd Gathering at ${label}`,
        description: `Sudden crowd cluster (${Math.round(severity * 100)}% density) detected in 2D radar simulation.`,
        recommended_action: `Deploy crowd marshals to ${label} and divert fan traffic to adjacent low-wait nodes.`,
        confidence: 0.94,
      };

      setIncidents((prev) => [newIncident, ...prev]);

      if (connectionStatus === "live") {
        try {
          await controlBottleneck({ node_id: nodeId, severity, clear: false });
          await createIncident({
            category: "crowd_bottleneck",
            severity: severity >= 0.85 ? "critical" : "high",
            node_id: nodeId,
            title: newIncident.title,
            description: newIncident.description,
            recommended_action: newIncident.recommended_action,
          });
        } catch {
          // Local simulation state remains active
        }
      }
    },
    [connectionStatus]
  );

  const clearCrowdSurge = useCallback(
    async (nodeId: string) => {
      const now = new Date().toISOString();
      setTelemetry((prev) => ({
        ...prev,
        timestamp: now,
        nodes: prev.nodes.map((n) =>
          n.node_id === nodeId
            ? {
                ...n,
                congestion_score: 0.24,
                occupancy: Math.round(n.capacity * 0.28),
                queue_length: 12,
                estimated_wait_min: 1.6,
                trend: "falling",
                pulse_intensity: 0.24,
                status: "optimal",
              }
            : n
        ),
      }));
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.node_id === nodeId && inc.status !== "resolved"
            ? { ...inc, status: "resolved", updated_at: now }
            : inc
        )
      );
      setLastUpdatedAt(now);

      try {
        await controlBottleneck({ node_id: nodeId, clear: true });
      } catch {
        // Local clear remains active if backend is offline
      }
    },
    []
  );

  return {
    topology,
    telemetry,
    incidents,
    activeFans,
    mode,
    setMode,
    simPaused,
    setSimPaused,
    connectionStatus,
    lastUpdatedAt,
    isStale,
    updateIncidentStatus,
    simulateCrowdSurge,
    clearCrowdSurge,
    refreshNow: connectLive,
  };
}
