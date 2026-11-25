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
    sim.inject_bottleneck("gate_1_cubbon", severity=0.95, duration_ticks=2)

    snap1 = sim.step()
    gate1 = next(n for n in snap1.nodes if n.node_id == "gate_1_cubbon")
    assert gate1.congestion_score >= 0.65
    assert gate1.queue_length >= 15
    assert gate1.pulse_intensity > 0.5

    # Tick 2 still active, then expires
    snap2 = sim.step()
    gate2 = next(n for n in snap2.nodes if n.node_id == "gate_1_cubbon")
    assert gate2.status in ("high", "critical")
    assert "gate_1_cubbon" not in sim._bottlenecks


def test_simulator_immediate_bottleneck_override_and_clear() -> None:
    sim = CrowdSimulator(seed=42, initial_phase="in_play")
    sim.step()

    # Inject 96% bottleneck -> immediate jump on next single tick
    sim.inject_bottleneck("gate_4_cubbon", severity=0.96)
    snap_inj = sim.step()
    gate = next(n for n in snap_inj.nodes if n.node_id == "gate_4_cubbon")
    assert gate.congestion_score >= 0.94

    # Clear bottleneck -> immediate drop back toward in_play gate baseline on next single tick
    sim.clear_bottleneck("gate_4_cubbon")
    snap_clr = sim.step()
    gate_clr = next(n for n in snap_clr.nodes if n.node_id == "gate_4_cubbon")
    assert gate_clr.congestion_score < 0.35
    assert gate_clr.status == "optimal"


def test_simulator_clear_bottleneck_relieves_even_during_ingress_surge() -> None:
    sim = CrowdSimulator(seed=42, initial_phase="pre_event_ingress")
    sim.inject_bottleneck("gate_1_cubbon", severity=0.95)
    sim.step()
    sim.clear_bottleneck("gate_1_cubbon")
    for _ in range(10):
        snap = sim.step()
        gate = next(n for n in snap.nodes if n.node_id == "gate_1_cubbon")
        assert gate.congestion_score < 0.35
        assert gate.status == "optimal"
