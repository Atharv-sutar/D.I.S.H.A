"""Tests for NetworkX 3D WayfindingEngine."""

from disha_intelligence.routing import WayfindingEngine
from disha_intelligence.simulator import CrowdSimulator


def test_routing_avoids_congested_gate() -> None:
    sim = CrowdSimulator(seed=42, initial_phase="pre_event_ingress")
    sim.inject_bottleneck("gate_1_cubbon", severity=0.98)
    for _ in range(4):
        snap = sim.step()

    engine = WayfindingEngine(sim.topology)
    guidance = engine.recommend(
        origin_node_id="transit_cubbon_park_metro",
        snapshot=snap,
        target_type="gate",
    )

    assert guidance.recommended_target_id != "gate_1_cubbon"
    assert guidance.time_saved_min > 0.0
    assert guidance.route_node_ids[0] == "transit_cubbon_park_metro"
    assert guidance.route_node_ids[-1] == guidance.recommended_target_id
    assert len(guidance.steps) == len(guidance.route_node_ids)
    assert len(guidance.waypoints_3d) == len(guidance.route_node_ids)
    assert guidance.waypoints_3d[0].waypoint_type == "origin"
    assert guidance.waypoints_3d[-1].waypoint_type == "destination"
    assert guidance.user_position is not None
    assert guidance.user_position.snapped_node_id == "transit_cubbon_park_metro"
    assert guidance.target_beacon is not None
    assert guidance.target_beacon.node_id == guidance.recommended_target_id
    assert len(guidance.alternatives) >= 1


def test_routing_accessible_only_excludes_stairs() -> None:
    sim = CrowdSimulator(seed=42, initial_phase="in_play")
    snap = sim.step()
    engine = WayfindingEngine(sim.topology)

    # From Medical Bay Pavilion to Pavilion Terrace Dining (Level 2):
    # e_med_w_pav_lounge is stairs-only (accessible=False), so accessible_only=True
    # must route via concourse_west_pavilion -> stand_pavilion_p2 -> concession_west_pavilion_lounge
    standard = engine.recommend(
        origin_node_id="medical_pavilion_post",
        snapshot=snap,
        target_id="concession_west_pavilion_lounge",
        accessible_only=False,
    )
    accessible = engine.recommend(
        origin_node_id="medical_pavilion_post",
        snapshot=snap,
        target_id="concession_west_pavilion_lounge",
        accessible_only=True,
    )

    assert standard.route_node_ids == [
        "medical_pavilion_post",
        "concession_west_pavilion_lounge",
    ]
    assert accessible.accessible_only is True
    assert "stand_pavilion_p2" in accessible.route_node_ids
