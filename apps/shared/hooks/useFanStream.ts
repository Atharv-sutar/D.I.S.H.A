"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AlertIncident,
  FanGuidanceResponse,
  StadiumTopology,
  TelemetrySnapshot,
  UserPosition3D,
} from "../types/contracts";
import type {
  ConnectionStatus,
  DataSourceMode,
  FanAdvisoryItem,
  FanWsEnvelope,
  RoutingQueryParams,
} from "../types/ws";
import {
  fetchIncidents,
  fetchLatestTelemetry,
  fetchRoutingRecommend,
  fetchVenueTopology,
  getWsFanUrl,
  locateFanPosition,
} from "../lib/apiClient";
import {
  createInitialAdvisories,
  createInitialIncidents,
  createInitialTelemetry,
  MOCK_TOPOLOGY,
} from "../mock/stadiumData";
import {
  computeMockFanGuidance,
  generateMockFanAdvisory,
  snapPositionToNodeClient,
  tickTelemetrySnapshot,
} from "../mock/simulator";

export interface UseFanStreamResult {
  topology: StadiumTopology;
  telemetry: TelemetrySnapshot;
  incidents: AlertIncident[];
  advisories: FanAdvisoryItem[];
  guidance: FanGuidanceResponse | null;
  userPosition: UserPosition3D;
  isRouting: boolean;
  mode: DataSourceMode;
  setMode: (mode: DataSourceMode) => void;
  connectionStatus: ConnectionStatus;
  lastUpdatedAt: string | null;
  requestGuidance: (params: RoutingQueryParams) => Promise<void>;
  setUserCoordinates: (
    x: number,
    y: number,
    level?: number,
    headingDeg?: number
  ) => Promise<void>;
}

const DEFAULT_USER_POSITION: UserPosition3D = {
  x: -115,
  y: 132,
  z: 0,
  level: 0,
  heading_deg: 135,
  snapped_node_id: "transit_cubbon_park_metro",
};

export function useFanStream(initialParams: RoutingQueryParams): UseFanStreamResult {
  const [topology, setTopology] = useState<StadiumTopology>(MOCK_TOPOLOGY);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(() =>
    createInitialTelemetry()
  );
  const [incidents, setIncidents] = useState<AlertIncident[]>(() =>
    createInitialIncidents()
  );
  const [advisories, setAdvisories] = useState<FanAdvisoryItem[]>(() =>
    createInitialAdvisories()
  );
  const [queryParams, setQueryParams] =
    useState<RoutingQueryParams>(initialParams);
  const [userPosition, setUserPosition] = useState<UserPosition3D>(
    DEFAULT_USER_POSITION
  );
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

  const fanIdRef = useRef<string>(
    `fan_${Math.random().toString(36).slice(2, 8)}`
  );
  const wsRef = useRef<WebSocket | null>(null);
  const topologyRef = useRef(topology);
  topologyRef.current = topology;
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;
  const queryRef = useRef(queryParams);
  queryRef.current = queryParams;
  const userPosRef = useRef(userPosition);
  userPosRef.current = userPosition;

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
      const enrichedParams: RoutingQueryParams = {
        ...params,
        fan_id: fanIdRef.current,
      };
      setQueryParams(enrichedParams);

      const effectiveStatus = statusOverride ?? connectionStatus;
      if (effectiveStatus === "live") {
        try {
          const liveResult = await fetchRoutingRecommend(enrichedParams);
          setGuidance(liveResult);
          if (liveResult.user_position) {
            setUserPosition(liveResult.user_position);
          }
          setIsRouting(false);
          return;
        } catch {
          // Fall back cleanly to local routing solver
        }
      }
      const mockResult = computeMockFanGuidance(
        topologyRef.current,
        telemetryRef.current,
        enrichedParams
      );
      setGuidance(mockResult);
      if (mockResult.user_position) {
        setUserPosition(mockResult.user_position);
      }
      setIsRouting(false);
    },
    [connectionStatus]
  );

  const setUserCoordinates = useCallback(
    async (x: number, y: number, level?: number, headingDeg = 0) => {
      const snappedLocal = snapPositionToNodeClient(
        topologyRef.current,
        x,
        y,
        level
      );
      let nextPos: UserPosition3D = {
        x: Number(x.toFixed(1)),
        y: Number(y.toFixed(1)),
        z: snappedLocal.node.z ?? 0,
        level: level ?? snappedLocal.node.level,
        heading_deg: headingDeg,
        snapped_node_id: snappedLocal.node.id,
      };

      if (connectionStatus === "live") {
        try {
          const res = await locateFanPosition({
            fan_id: fanIdRef.current,
            x,
            y,
            z: snappedLocal.node.z ?? 0,
            level,
            heading_deg: headingDeg,
          });
          nextPos = res.user_position;
        } catch {
          // Use local snap fallback
        }
      }

      setUserPosition(nextPos);
      await runGuidance({
        ...queryRef.current,
        origin: nextPos.snapped_node_id,
        user_x: nextPos.x,
        user_y: nextPos.y,
        user_z: nextPos.z,
        user_level: nextPos.level,
        heading_deg: nextPos.heading_deg,
      });
    },
    [connectionStatus, runGuidance]
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
        const [topo, snap, incs] = await Promise.all([
          fetchVenueTopology(),
          fetchLatestTelemetry(),
          fetchIncidents().catch(() => createInitialIncidents()),
        ]);
        if (cancelled) return;
        setTopology(topo);
        setTelemetry(snap);
        setIncidents(incs);
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

  useEffect(() => {
    if (connectionStatus !== "simulation") return;
    const timer = setInterval(() => {
      setTelemetry((prev) => {
        const next = tickTelemetrySnapshot(prev, topologyRef.current);
        setLastUpdatedAt(next.timestamp);
        setGuidance(
          computeMockFanGuidance(topologyRef.current, next, {
            ...queryRef.current,
            user_x: userPosRef.current.x,
            user_y: userPosRef.current.y,
            user_z: userPosRef.current.z,
            user_level: userPosRef.current.level,
            heading_deg: userPosRef.current.heading_deg,
          })
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
    incidents,
    advisories,
    guidance,
    userPosition,
    isRouting,
    mode,
    setMode,
    connectionStatus,
    lastUpdatedAt,
    requestGuidance: (params) => runGuidance(params),
    setUserCoordinates,
  };
}
