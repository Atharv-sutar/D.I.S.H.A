"""Optional non-blocking bridge to Shreyas's Intelligence service (port 8001)."""

from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from typing import Any


class IntelligenceClient:
    """HTTP bridge to services/intelligence with fast failback when offline."""

    def __init__(self, base_url: str | None = None, timeout_sec: float = 1.0) -> None:
        self.base_url = (
            base_url or os.environ.get("INTELLIGENCE_BASE_URL", "http://127.0.0.1:8001")
        ).rstrip("/")
        self.timeout_sec = timeout_sec

    def _request_sync(
        self, method: str, path: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any] | None:
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                if resp.status >= 400:
                    return None
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            return None

    async def fetch_forecast(self) -> dict[str, Any] | None:
        """Fetch /forecast from intelligence microservice, or None if unavailable."""
        return await asyncio.to_thread(self._request_sync, "GET", "/forecast", None)

    async def set_phase(self, phase: str) -> dict[str, Any] | None:
        """Forward event phase update to /simulation/phase."""
        return await asyncio.to_thread(
            self._request_sync, "POST", "/simulation/phase", {"phase": phase}
        )

    async def set_bottleneck(
        self,
        node_id: str,
        severity: float = 0.92,
        duration_ticks: int | None = None,
        clear: bool = False,
    ) -> dict[str, Any] | None:
        """Forward bottleneck injection/clear command to /simulation/bottleneck."""
        payload: dict[str, Any] = {
            "node_id": node_id,
            "severity": severity,
            "clear": clear,
        }
        if duration_ticks is not None:
            payload["duration_ticks"] = duration_ticks
        return await asyncio.to_thread(
            self._request_sync, "POST", "/simulation/bottleneck", payload
        )

    async def set_randomizer(self, enabled: bool) -> dict[str, Any] | None:
        """Forward randomizer/manual control mode toggle to /simulation/mode."""
        return await asyncio.to_thread(
            self._request_sync,
            "POST",
            "/simulation/mode",
            {
                "randomizer_enabled": enabled,
                "mode": "randomized" if enabled else "manual",
            },
        )
