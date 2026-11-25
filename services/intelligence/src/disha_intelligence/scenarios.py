"""Named matchday simulation scenarios for testing and live demos."""

from __future__ import annotations

from dataclasses import dataclass

from disha_intelligence.models import EventPhase
from disha_intelligence.simulator import CrowdSimulator


@dataclass(frozen=True)
class ScenarioSpec:
    """Definition of a reproducible stadium simulation scenario."""

    name: str
    description: str
    phase: EventPhase
    bottlenecks: tuple[tuple[str, float, int | None], ...] = ()


SCENARIOS: dict[str, ScenarioSpec] = {
    "matchday_ingress": ScenarioSpec(
        name="matchday_ingress",
        description="Pre-event gate arrival surge with heavy load at North Gate A.",
        phase="pre_event_ingress",
        bottlenecks=(("gate_north_a", 0.93, 12),),
    ),
    "halftime_rush": ScenarioSpec(
        name="halftime_rush",
        description="Halftime concourse and concession spike with North Grill bottleneck.",
        phase="halftime_surge",
        bottlenecks=(
            ("concession_l1_north_grill", 0.96, 10),
            ("restroom_l1_east", 0.90, 8),
        ),
    ),
    "in_play_steady": ScenarioSpec(
        name="in_play_steady",
        description="Normal in-play steady state with fans seated.",
        phase="in_play",
    ),
    "post_match_egress": ScenarioSpec(
        name="post_match_egress",
        description="Post-event exit surge toward North Metro and South Rail transit hubs.",
        phase="egress",
        bottlenecks=(("transit_north_metro", 0.94, 15),),
    ),
}


def build_scenario_simulator(
    scenario_name: str,
    seed: int = 42,
    tick_seconds: float = 2.0,
) -> CrowdSimulator:
    """Create a CrowdSimulator pre-configured for a named scenario."""
    if scenario_name not in SCENARIOS:
        valid = ", ".join(sorted(SCENARIOS))
        raise KeyError(f"Unknown scenario '{scenario_name}'. Available: {valid}")

    spec = SCENARIOS[scenario_name]
    sim = CrowdSimulator(seed=seed, initial_phase=spec.phase, tick_seconds=tick_seconds)
    for node_id, severity, duration in spec.bottlenecks:
        sim.inject_bottleneck(node_id, severity=severity, duration_ticks=duration)
    return sim
