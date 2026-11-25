"""Async HTTP simulation runner publishing telemetry and alerts to services/backend."""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass

import httpx

from disha_intelligence.detector import IncidentDetector
from disha_intelligence.models import AlertIncident, TelemetrySnapshot
from disha_intelligence.simulator import CrowdSimulator

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PublisherConfig:
    """Configuration for the simulation publisher loop."""

    ingest_url: str = "http://localhost:8000/api/v1/telemetry/ingest"
    incidents_url: str = "http://localhost:8000/api/v1/incidents"
    tick_interval_seconds: float = 2.0
    random_seed: int = 42

    @classmethod
    def from_env(cls) -> PublisherConfig:
        """Load publisher configuration from environment variables."""
        return cls(
            ingest_url=os.getenv(
                "BACKEND_INGEST_URL", "http://localhost:8000/api/v1/telemetry/ingest"
            ),
            incidents_url=os.getenv(
                "BACKEND_INCIDENTS_URL", "http://localhost:8000/api/v1/incidents"
            ),
            tick_interval_seconds=float(os.getenv("TICK_INTERVAL_SECONDS", "2.0")),
            random_seed=int(os.getenv("RANDOM_SEED", "42")),
        )


class SimulationPublisher:
    """Runs CrowdSimulator + IncidentDetector and posts payloads over HTTP."""

    def __init__(
        self,
        config: PublisherConfig | None = None,
        simulator: CrowdSimulator | None = None,
        detector: IncidentDetector | None = None,
    ) -> None:
        self.config = config or PublisherConfig.from_env()
        self.simulator = simulator or CrowdSimulator(
            seed=self.config.random_seed,
            tick_seconds=self.config.tick_interval_seconds,
        )
        self.detector = detector or IncidentDetector(topology=self.simulator.topology)

    async def publish_tick(
        self, client: httpx.AsyncClient
    ) -> tuple[TelemetrySnapshot, list[AlertIncident]]:
        """Advance one simulation tick, detect incidents, and POST to backend."""
        snapshot = self.simulator.step()
        incidents = self.detector.analyze(snapshot)

        resp = await client.post(
            self.config.ingest_url,
            json=snapshot.model_dump(mode="json"),
        )
        resp.raise_for_status()

        for incident in incidents:
            inc_resp = await client.post(
                self.config.incidents_url,
                json=incident.model_dump(mode="json"),
            )
            inc_resp.raise_for_status()

        return snapshot, incidents

    async def run_loop(self, max_ticks: int | None = None) -> None:
        """Continuously publish simulation ticks until max_ticks or cancellation."""
        ticks = 0
        async with httpx.AsyncClient(timeout=5.0) as client:
            while max_ticks is None or ticks < max_ticks:
                try:
                    snapshot, incidents = await self.publish_tick(client)
                    logger.info(
                        "Published tick %s (%s) with %d incidents",
                        snapshot.timestamp.isoformat(),
                        snapshot.event_phase,
                        len(incidents),
                    )
                except httpx.HTTPError as exc:
                    logger.warning("Backend publish failed: %s", exc)
                ticks += 1
                if max_ticks is not None and ticks >= max_ticks:
                    break
                await asyncio.sleep(self.config.tick_interval_seconds)


def main() -> None:
    """CLI entrypoint for running the D.I.S.H.A. intelligence publisher."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    asyncio.run(SimulationPublisher().run_loop())


if __name__ == "__main__":
    main()
