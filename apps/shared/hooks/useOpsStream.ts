"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AlertIncident,
  IncidentStatus,
  StadiumTopology,
  TelemetrySnapshot,
} from "../types/contracts";
import type {
  ConnectionStatus,
  DataSourceMode,
  OpsWsEnvelope,
} from "../types/ws";
import {
  fetchIncidents,
  fetchLatestTelemetry,
  fetchVenueTopology,
  getWsOpsUrl,
  patchIncident,
} from "../lib/apiClient";
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
  mode: DataSourceMode;
  setMode: (mode: DataSourceMode) => void;
  connectionStatus: ConnectionStatus;
  lastUpdatedAt: string | null;
  isStale: boolean;
  updateIncidentStatus: (
    incidentId: string,
    status: IncidentStatus,
    assignedTeam?: string
  ) => Promise<void>;
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
  const [mode, setMode] = useState<DataSourceMode>("auto");
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
      const [topo, snap, incs] = await Promise.all([
        fetchVenueTopology(),
        fetchLatestTelemetry(),
        fetchIncidents(),
      ]);
      setTopology(topo);
      setTelemetry(snap);
      setIncidents(incs);
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
    if (connectionStatus !== "simulation") return;
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
    }, 3500);

    return () => clearInterval(timer);
  }, [connectionStatus]);

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
      // Optimistic UI update
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

  return {
    topology,
    telemetry,
    incidents,
    mode,
    setMode,
    connectionStatus,
    lastUpdatedAt,
    isStale,
    updateIncidentStatus,
    refreshNow: connectLive,
  };
}
