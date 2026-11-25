"""Async HTTP simulation runner publishing telemetry and alerts to services/backend."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
from dataclasses import dataclass

import httpx

from disha_intelligence.detector import IncidentDetector
from disha_intelligence.models import AlertIncident, TelemetrySnapshot
from disha_intelligence.scenarios import SCENARIOS, build_scenario_simulator
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

    async def run_loop(self, max_ticks: int | None = None, dry_run: bool = False) -> None:
        """Continuously publish simulation ticks until max_ticks or cancellation."""
        ticks = 0
        async with httpx.AsyncClient(timeout=5.0) as client:
            while max_ticks is None or ticks < max_ticks:
                if dry_run:
                    snapshot = self.simulator.step()
                    incidents = self.detector.analyze(snapshot)
                    print(
                        json.dumps(
                            {
                                "telemetry": snapshot.model_dump(mode="json"),
                                "incidents": [i.model_dump(mode="json") for i in incidents],
                            }
                        )
                    )
                else:
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


def main(argv: list[str] | None = None) -> None:
    """CLI entrypoint for running the D.I.S.H.A. intelligence publisher."""
    parser = argparse.ArgumentParser(description="D.I.S.H.A. Crowd Simulation Publisher")
    parser.add_argument(
        "--scenario",
        choices=sorted(SCENARIOS),
        default="matchday_ingress",
        help="Named matchday scenario to simulate.",
    )
    parser.add_argument("--ticks", type=int, default=None, help="Max ticks to run.")
    parser.add_argument("--dry-run", action="store_true", help="Print JSON ticks to stdout.")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    config = PublisherConfig.from_env()
    sim = build_scenario_simulator(
        args.scenario,
        seed=config.random_seed,
        tick_seconds=config.tick_interval_seconds,
    )
    asyncio.run(SimulationPublisher(config=config, simulator=sim).run_loop(args.ticks, args.dry_run))


if __name__ == "__main__":
    main()
