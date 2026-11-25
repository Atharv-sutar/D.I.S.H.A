"""FastAPI application entrypoint for D.I.S.H.A. Core Backend."""

from __future__ import annotations

from datetime import datetime, timezone

try:
    from fastapi import FastAPI
except ImportError:  # Allows package inspection before `pip install -e .`
    FastAPI = None  # type: ignore[assignment]


def build_health_payload() -> dict[str, str]:
    """Return service health metadata conforming to /health contract."""
    return {
        "service": "disha-backend",
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


if FastAPI is not None:
    app = FastAPI(
        title="D.I.S.H.A. Core Backend & Streaming API",
        version="0.1.0",
        description="Real-time stadium telemetry, routing gateway, and incident dispatch API.",
    )

    @app.get("/health", tags=["system"])
    async def health_check() -> dict[str, str]:
        """Liveness check endpoint."""
        return build_health_payload()
else:
    app = None
