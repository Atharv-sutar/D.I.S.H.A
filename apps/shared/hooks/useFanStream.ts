"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FanGuidanceResponse,
  StadiumTopology,
  TelemetrySnapshot,
} from "../types/contracts";
import type {
  ConnectionStatus,
  DataSourceMode,
  FanAdvisoryItem,
  FanWsEnvelope,
  RoutingQueryParams,
} from "../types/ws";
import {
  fetchLatestTelemetry,
  fetchRoutingRecommend,
  fetchVenueTopology,
  getWsFanUrl,
} from "../lib/apiClient";
import {
  createInitialAdvisories,
  createInitialTelemetry,
  MOCK_TOPOLOGY,
} from "../mock/stadiumData";
import {
  computeMockFanGuidance,
  generateMockFanAdvisory,
  tickTelemetrySnapshot,
} from "../mock/simulator";

export interface UseFanStreamResult {
  topology: StadiumTopology;
  telemetry: TelemetrySnapshot;
  advisories: FanAdvisoryItem[];
  guidance: FanGuidanceResponse | null;
  isRouting: boolean;
  mode: DataSourceMode;
  setMode: (mode: DataSourceMode) => void;
  connectionStatus: ConnectionStatus;
  lastUpdatedAt: string | null;
  requestGuidance: (params: RoutingQueryParams) => Promise<void>;
}

export function useFanStream(initialParams: RoutingQueryParams): UseFanStreamResult {
  const [topology, setTopology] = useState<StadiumTopology>(MOCK_TOPOLOGY);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(() =>
    createInitialTelemetry()
  );
  const [advisories, setAdvisories] = useState<FanAdvisoryItem[]>(() =>
    createInitialAdvisories()
  );
  const [queryParams, setQueryParams] =
    useState<RoutingQueryParams>(initialParams);
  const [guidance, setGuidance] = useState<FanGuidanceResponse | null>(() =>
    computeMockFanGuidance(MOCK_TOPOLOGY, createInitialTelemetry(), initialParams)
  );
  const [isRouting, setIsRouting] = useState(false);
  const [mode, setMode] = useState<DataSourceMode>("auto");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(() =>
    new Date().toISOString()
  );

  const wsRef = useRef<WebSocket | null>(null);
  const topologyRef = useRef(topology);
  topologyRef.current = topology;
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;
  const queryRef = useRef(queryParams);
  queryRef.current = queryParams;

  const startSimulationMode = useCallback(() => {
    setConnectionStatus("simulation");
    setLastUpdatedAt(new Date().toISOString());
  }, []);

  const runGuidance = useCallback(
    async (
      params: RoutingQueryParams,
      statusOverride?: ConnectionStatus
    ) => {
      setIsRouting(true);
      setQueryParams(params);
      const effectiveStatus = statusOverride ?? connectionStatus;
      if (effectiveStatus === "live") {
        try {
          const liveResult = await fetchRoutingRecommend(params);
          setGuidance(liveResult);
          setIsRouting(false);
          return;
        } catch {
          // Fall back cleanly to local routing solver
        }
      }
      const mockResult = computeMockFanGuidance(
        topologyRef.current,
        telemetryRef.current,
        params
      );
      setGuidance(mockResult);
      setIsRouting(false);
    },
    [connectionStatus]
  );

  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (mode === "simulation") {
      startSimulationMode();
      void runGuidance(queryRef.current, "simulation");
      return;
    }

    let cancelled = false;
    setConnectionStatus("connecting");

    const init = async () => {
      try {
        const [topo, snap] = await Promise.all([
          fetchVenueTopology(),
          fetchLatestTelemetry(),
        ]);
        if (cancelled) return;
        setTopology(topo);
        setTelemetry(snap);
        setLastUpdatedAt(snap.timestamp || new Date().toISOString());
        await runGuidance(queryRef.current, "live");
      } catch {
        if (cancelled) return;
        if (mode === "live") {
          setConnectionStatus("offline");
          return;
        }
        startSimulationMode();
        await runGuidance(queryRef.current, "simulation");
        return;
      }

      try {
        const ws = new WebSocket(getWsFanUrl());
        wsRef.current = ws;
        ws.onopen = () => setConnectionStatus("live");
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(String(event.data)) as FanWsEnvelope;
            setLastUpdatedAt(msg.timestamp || new Date().toISOString());
            if (msg.event === "wait_times_update") {
              setTelemetry(msg.payload);
            } else {
              const item: FanAdvisoryItem = {
                ...msg.payload,
                event: msg.event,
                timestamp: msg.timestamp || new Date().toISOString(),
              };
              setAdvisories((prev) => [item, ...prev].slice(0, 8));
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
    };

    void init();
    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [mode, startSimulationMode, runGuidance]);

  // Simulation loop for live fan wait times & advisories
  useEffect(() => {
    if (connectionStatus !== "simulation") return;
    const timer = setInterval(() => {
      setTelemetry((prev) => {
        const next = tickTelemetrySnapshot(prev, topologyRef.current);
        setLastUpdatedAt(next.timestamp);
        setGuidance(
          computeMockFanGuidance(topologyRef.current, next, queryRef.current)
        );
        if (Math.random() < 0.3) {
          const nextAdvisory = generateMockFanAdvisory(
            next,
            topologyRef.current
          );
          setAdvisories((prevAdv) => [nextAdvisory, ...prevAdv].slice(0, 6));
        }
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [connectionStatus]);

  return {
    topology,
    telemetry,
    advisories,
    guidance,
    isRouting,
    mode,
    setMode,
    connectionStatus,
    lastUpdatedAt,
    requestGuidance: (params) => runGuidance(params),
  };
}
