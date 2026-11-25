"""Tests for deterministic CrowdSimulator."""

from disha_intelligence.simulator import CrowdSimulator


def test_simulator_is_deterministic_with_seed() -> None:
    sim_a = CrowdSimulator(seed=42, initial_phase="pre_event_ingress")
    sim_b = CrowdSimulator(seed=42, initial_phase="pre_event_ingress")

    for _ in range(5):
        snap_a = sim_a.step()
        snap_b = sim_b.step()
        assert snap_a.model_dump() == snap_b.model_dump()


def test_simulator_halftime_increases_concession_congestion() -> None:
    sim = CrowdSimulator(seed=7, initial_phase="in_play")
    for _ in range(3):
        in_play_snap = sim.step()

    in_play_concessions = [
        n.congestion_score for n in in_play_snap.nodes if n.node_id.startswith("concession_")
    ]

    sim.set_phase("halftime_surge")
    for _ in range(6):
        halftime_snap = sim.step()

    halftime_concessions = [
        n.congestion_score for n in halftime_snap.nodes if n.node_id.startswith("concession_")
    ]
    assert sum(halftime_concessions) > sum(in_play_concessions)


def test_simulator_bottleneck_injection_and_expiry() -> None:
    sim = CrowdSimulator(seed=11, initial_phase="in_play")
    sim.inject_bottleneck("gate_north_a", severity=0.95, duration_ticks=2)

    snap1 = sim.step()
    gate1 = next(n for n in snap1.nodes if n.node_id == "gate_north_a")
    assert gate1.congestion_score >= 0.65
    assert gate1.queue_length >= 15

    # Tick 2 still active, then expires
    snap2 = sim.step()
    gate2 = next(n for n in snap2.nodes if n.node_id == "gate_north_a")
    assert gate2.status in ("high", "critical")
    assert "gate_north_a" not in sim._bottlenecks
