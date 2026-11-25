"""Short-horizon congestion & wait-time forecasting over sliding telemetry windows."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import numpy as np

from disha_intelligence.models import TelemetrySnapshot


@dataclass(frozen=True)
class NodeForecast:
    """Short-horizon forecast for a single stadium node."""

    node_id: str
    current_congestion: float
    predicted_5m_congestion: float
    predicted_10m_congestion: float
    predicted_5m_wait_min: float
    predicted_10m_wait_min: float
    will_breach_critical: bool


class CongestionForecaster:
    """Tracks recent TelemetrySnapshots to forecast +5m and +10m congestion & wait times."""

    def __init__(self, window_size: int = 10, tick_seconds: float = 2.0) -> None:
        if window_size < 2:
            raise ValueError("window_size must be at least 2")
        self.window_size = window_size
        self.tick_seconds = tick_seconds
        self._congestion_history: dict[str, deque[float]] = {}
        self._wait_history: dict[str, deque[float]] = {}

    def record(self, snapshot: TelemetrySnapshot) -> None:
        """Append a TelemetrySnapshot to the sliding history window."""
        for node in snapshot.nodes:
            cong_q = self._congestion_history.setdefault(
                node.node_id, deque(maxlen=self.window_size)
            )
            wait_q = self._wait_history.setdefault(
                node.node_id, deque(maxlen=self.window_size)
            )
            cong_q.append(node.congestion_score)
            wait_q.append(node.estimated_wait_min)

    def forecast_node(self, node_id: str) -> NodeForecast:
        """Forecast +5m and +10m congestion and wait time for a specific node."""
        if node_id not in self._congestion_history:
            raise KeyError(f"No telemetry recorded for node_id: {node_id}")

        cong_vals = list(self._congestion_history[node_id])
        wait_vals = list(self._wait_history[node_id])
        curr_cong = cong_vals[-1]
        curr_wait = wait_vals[-1]

        # Damped linear slope per tick, projected to 5m and 10m horizons
        cong_slope = self._damped_slope(cong_vals)
        wait_slope = self._damped_slope(wait_vals)

        ticks_5m = min(30.0, 300.0 / max(self.tick_seconds, 1.0)) * 0.25
        ticks_10m = ticks_5m * 2.0

        pred_5m_cong = round(float(np.clip(curr_cong + cong_slope * ticks_5m, 0.0, 1.0)), 4)
        pred_10m_cong = round(float(np.clip(curr_cong + cong_slope * ticks_10m, 0.0, 1.0)), 4)
        pred_5m_wait = round(max(0.0, curr_wait + wait_slope * ticks_5m), 2)
        pred_10m_wait = round(max(0.0, curr_wait + wait_slope * ticks_10m), 2)

        return NodeForecast(
            node_id=node_id,
            current_congestion=curr_cong,
            predicted_5m_congestion=pred_5m_cong,
            predicted_10m_congestion=pred_10m_cong,
            predicted_5m_wait_min=pred_5m_wait,
            predicted_10m_wait_min=pred_10m_wait,
            will_breach_critical=(pred_5m_cong >= 0.85 or pred_10m_cong >= 0.85),
        )

    def forecast_all(self) -> list[NodeForecast]:
        """Return forecasts for all tracked nodes sorted by predicted_5m_congestion desc."""
        forecasts = [self.forecast_node(nid) for nid in self._congestion_history]
        forecasts.sort(key=lambda f: f.predicted_5m_congestion, reverse=True)
        return forecasts

    @staticmethod
    def _damped_slope(values: list[float]) -> float:
        if len(values) < 2:
            return 0.0
        x = np.arange(len(values), dtype=float)
        y = np.asarray(values, dtype=float)
        slope = float(np.polyfit(x, y, 1)[0])
        return slope * 0.7
