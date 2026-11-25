"""Tests for NetworkX WayfindingEngine."""

from disha_intelligence.routing import WayfindingEngine
from disha_intelligence.simulator import CrowdSimulator


def test_routing_avoids_congested_gate() -> None:
    sim = CrowdSimulator(seed=42, initial_phase="pre_event_ingress")
    sim.inject_bottleneck("gate_north_a", severity=0.98)
    for _ in range(4):
        snap = sim.step()

    engine = WayfindingEngine(sim.topology)
    guidance = engine.recommend(
        origin_node_id="transit_north_metro",
        snapshot=snap,
        target_type="gate",
    )

    assert guidance.recommended_target_id != "gate_north_a"
    assert guidance.time_saved_min > 0.0
    assert guidance.route_node_ids[0] == "transit_north_metro"
    assert guidance.route_node_ids[-1] == guidance.recommended_target_id
    assert len(guidance.steps) == len(guidance.route_node_ids)
    assert len(guidance.alternatives) >= 1


def test_routing_accessible_only_excludes_stairs() -> None:
    sim = CrowdSimulator(seed=42, initial_phase="in_play")
    snap = sim.step()
    engine = WayfindingEngine(sim.topology)

    # From L1 East Concourse to L2 Skydeck Cafe:
    # Non-accessible can use stairs directly (zone_concourse_l1_e -> zone_concourse_l2_n -> concession_l2_north_cafe)
    standard = engine.recommend(
        origin_node_id="zone_concourse_l1_e",
        snapshot=snap,
        target_id="concession_l2_north_cafe",
        accessible_only=False,
    )
    accessible = engine.recommend(
        origin_node_id="zone_concourse_l1_e",
        snapshot=snap,
        target_id="concession_l2_north_cafe",
        accessible_only=True,
    )

    assert standard.route_node_ids == [
        "zone_concourse_l1_e",
        "zone_concourse_l2_n",
        "concession_l2_north_cafe",
    ]
    assert accessible.accessible_only is True
    # Must route via accessible ramp at L1 North Concourse instead of East stairs
    assert "zone_concourse_l1_n" in accessible.route_node_ids
