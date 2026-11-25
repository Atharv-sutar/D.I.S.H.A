"""WebSocket room manager for /ws/ops and /ws/fan live streams."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """Tracks active WebSocket clients per channel and broadcasts JSON envelopes."""

    def __init__(self) -> None:
        self.channels: dict[str, set[WebSocket]] = {"ops": set(), "fan": set()}

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        """Accept and register a client on the given channel."""
        await websocket.accept()
        self.channels.setdefault(channel, set()).add(websocket)

    def disconnect(self, channel: str, websocket: WebSocket) -> None:
        """Remove a client from the channel."""
        self.channels.get(channel, set()).discard(websocket)

    def counts(self) -> dict[str, int]:
        """Return active client counts per channel."""
        return {ch: len(clients) for ch, clients in self.channels.items()}

    async def broadcast(self, channel: str, event: str, payload: Any) -> None:
        """Send a structured event envelope to all clients on a channel."""
        envelope = {
            "event": event,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        stale: list[WebSocket] = []
        for ws in list(self.channels.get(channel, set())):
            try:
                await ws.send_json(envelope)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(channel, ws)
