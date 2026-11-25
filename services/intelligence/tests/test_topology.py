"""Tests for StadiumTopology seed graph."""

import re

from disha_intelligence.topology import build_default_topology


def test_default_topology_schema_integrity() -> None:
    topology = build_default_topology()
    assert topology.venue_id == "disha_arena_01"
    assert topology.levels == [1, 2]
    assert len(topology.nodes) >= 20
    assert len(topology.edges) >= 25

    node_ids = {n.id for n in topology.nodes}
    assert len(node_ids) == len(topology.nodes)

    for node in topology.nodes:
        assert re.match(r"^[a-z0-9_]+$", node.id)
        assert 0.0 <= node.x <= 1000.0
        assert 0.0 <= node.y <= 1000.0
        assert node.level in topology.levels
        assert node.capacity >= 1

    for edge in topology.edges:
        assert edge.from_node in node_ids
        assert edge.to_node in node_ids
        assert edge.distance_m >= 0.0
        assert edge.width_m >= 0.5


def test_topology_has_accessible_and_stairs_edges() -> None:
    topology = build_default_topology()
    assert any(e.accessible for e in topology.edges)
    assert any(not e.accessible for e in topology.edges)
