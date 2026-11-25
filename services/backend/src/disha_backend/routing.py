"""Congestion-aware routing & 3D game-style waypoint generator."""

from __future__ import annotations

import heapq
from datetime import datetime, timezone

from disha_backend.models import (
    AlternativeFacility,
    FanGuidanceResponse,
    NodeTelemetry,
    NodeType,
    RouteStep,
    StadiumEdge,
    StadiumNode,
    StadiumTopology,
    TargetBeacon,
    UserPosition3D,
    Waypoint3D,
    WaypointType,
)


WALK_SPEED_M_PER_MIN = 72.0  # ~1.2 m/s comfortable stadium concourse walk


def _build_adjacency(
    topology: StadiumTopology, accessible_only: bool
) -> dict[str, list[tuple[str, StadiumEdge]]]:
    adj: dict[str, list[tuple[str, StadiumEdge]]] = {n.id: [] for n in topology.nodes}
    for edge in topology.edges:
        if accessible_only and not edge.accessible:
            continue
        adj.setdefault(edge.from_node, []).append((edge.to_node, edge))
        if edge.bidirectional:
            adj.setdefault(edge.to_node, []).append((edge.from_node, edge))
    return adj


def _edge_travel_cost_min(
    edge: StadiumEdge,
    dest_node: StadiumNode,
    telemetry_map: dict[str, NodeTelemetry],
    incident_nodes: set[str],
    ignore_congestion: bool = False,
) -> float:
    base_walk_min = edge.distance_m / WALK_SPEED_M_PER_MIN
    if ignore_congestion:
        return base_walk_min

    telem = telemetry_map.get(dest_node.id)
    congestion = telem.congestion_score if telem else 0.0
    penalty = 1.0 + (congestion * 2.5)
    if dest_node.id in incident_nodes:
        penalty += 4.0
    if dest_node.status == "restricted":
        penalty += 6.0
    return base_walk_min * penalty


def _shortest_path(
    topology: StadiumTopology,
    origin_id: str,
    target_id: str,
    telemetry_map: dict[str, NodeTelemetry],
    incident_nodes: set[str],
    accessible_only: bool,
    ignore_congestion: bool = False,
) -> tuple[list[str], float, float] | None:
    """Return (node_ids, total_distance_m, walk_time_min) or None if unreachable."""
    node_map = {n.id: n for n in topology.nodes}
    if origin_id not in node_map or target_id not in node_map:
        return None

    adj = _build_adjacency(topology, accessible_only=accessible_only)
    heap: list[tuple[float, str]] = [(0.0, origin_id)]
    best_cost: dict[str, float] = {origin_id: 0.0}
    prev: dict[str, tuple[str, StadiumEdge]] = {}

    while heap:
        cost, current = heapq.heappop(heap)
        if current == target_id:
            break
        if cost > best_cost.get(current, float("inf")):
            continue
        for nxt, edge in adj.get(current, []):
            nxt_node = node_map[nxt]
            if nxt_node.status == "closed":
                continue
            step_cost = _edge_travel_cost_min(
                edge,
                nxt_node,
                telemetry_map,
                incident_nodes,
                ignore_congestion=ignore_congestion,
            )
            nxt_cost = cost + step_cost
            if nxt_cost < best_cost.get(nxt, float("inf")):
                best_cost[nxt] = nxt_cost
                prev[nxt] = (current, edge)
                heapq.heappush(heap, (nxt_cost, nxt))

    if target_id not in best_cost:
        return None

    path: list[str] = [target_id]
    total_dist = 0.0
    cur = target_id
    while cur != origin_id:
        parent, edge = prev[cur]
        total_dist += edge.distance_m
        path.append(parent)
        cur = parent
    path.reverse()

    walk_min = round(total_dist / WALK_SPEED_M_PER_MIN, 2)
    return path, total_dist, walk_min


def _build_steps_and_waypoints(
    path: list[str],
    node_map: dict[str, StadiumNode],
    edge_lookup: dict[tuple[str, str], StadiumEdge],
    telemetry_map: dict[str, NodeTelemetry],
    incident_nodes: set[str],
) -> tuple[list[RouteStep], list[Waypoint3D]]:
    steps: list[RouteStep] = []
    waypoints: list[Waypoint3D] = []

    for idx, node_id in enumerate(path):
        node = node_map[node_id]
        prev_node = node_map[path[idx - 1]] if idx > 0 else None
        dist = edge_lookup[(path[idx - 1], node_id)].distance_m if idx > 0 else 0.0

        if idx == 0:
            wp_type: WaypointType = "origin"
            instruction = f"Start at {node.name}"
        elif idx == len(path) - 1:
            wp_type = "destination"
            if prev_node and prev_node.level != node.level:
                direction = "Ascend" if node.level > prev_node.level else "Descend"
                instruction = f"{direction} to Level {node.level} and arrive at {node.name}"
            else:
                instruction = f"Arrive at {node.name}"
        elif prev_node and prev_node.level != node.level:
            wp_type = "level_transition"
            direction = "ascend" if node.level > prev_node.level else "descend"
            instruction = f"{direction.capitalize()} to Level {node.level}: {node.name}"
        elif node_id in incident_nodes or (
            telemetry_map.get(node_id) and telemetry_map[node_id].congestion_score >= 0.7
        ):
            wp_type = "reroute_avoidance"
            instruction = f"Pass cautiously past {node.name} (elevated crowd)"
        else:
            wp_type = "checkpoint"
            instruction = f"Head toward {node.name}"

        order = idx + 1
        steps.append(
            RouteStep(
                order=order,
                node_id=node_id,
                instruction=instruction,
                distance_m=round(dist, 1),
            )
        )
        waypoints.append(
            Waypoint3D(
                order=order,
                node_id=node_id,
                x=node.x,
                y=node.y,
                z=node.z,
                level=node.level,
                waypoint_type=wp_type,
                instruction=instruction,
                distance_m=round(dist, 1),
            )
        )

    return steps, waypoints


def recommend_route(
    topology: StadiumTopology,
    telemetry_map: dict[str, NodeTelemetry],
    incident_nodes: set[str],
    origin_node_id: str,
    target_type: NodeType | None = None,
    target_id: str | None = None,
    accessible_only: bool = False,
    user_position: UserPosition3D | None = None,
) -> FanGuidanceResponse:
    """Select the least-congested facility or path and emit 3D hologram waypoints."""
    node_map = {n.id: n for n in topology.nodes}
    if origin_node_id not in node_map:
        raise ValueError(f"Unknown origin node: {origin_node_id}")

    edge_lookup: dict[tuple[str, str], StadiumEdge] = {}
    for edge in topology.edges:
        if accessible_only and not edge.accessible:
            continue
        edge_lookup[(edge.from_node, edge.to_node)] = edge
        if edge.bidirectional:
            edge_lookup[(edge.to_node, edge.from_node)] = edge

    if target_id:
        if target_id not in node_map:
            raise ValueError(f"Unknown target node: {target_id}")
        candidate_nodes = [node_map[target_id]]
    else:
        desired_type = target_type or "gate"
        candidate_nodes = [
            n for n in topology.nodes if n.type == desired_type and n.status != "closed"
        ]
        if not candidate_nodes:
            raise ValueError(f"No open facilities of type '{desired_type}' found")

    evaluated: list[tuple[float, float, float, StadiumNode, list[str]]] = []
    for cand in candidate_nodes:
        res = _shortest_path(
            topology,
            origin_node_id,
            cand.id,
            telemetry_map,
            incident_nodes,
            accessible_only=accessible_only,
            ignore_congestion=False,
        )
        if not res:
            continue
        path, _, walk_min = res
        telem = telemetry_map.get(cand.id)
        wait_min = telem.estimated_wait_min if telem else 0.0
        incident_bias = 8.0 if cand.id in incident_nodes else 0.0
        total_min = round(walk_min + wait_min + incident_bias, 2)
        evaluated.append((total_min, walk_min, wait_min, cand, path))

    if not evaluated:
        raise ValueError("No reachable route found for the requested accessibility/destination")

    evaluated.sort(key=lambda item: item[0])
    best_total, best_walk, best_wait, best_node, best_path = evaluated[0]

    # Compare against worst-case naive alternative (or raw unpenalized route) for time_saved_min
    if len(evaluated) > 1:
        max_total = max(item[0] for item in evaluated)
        time_saved = round(max(0.0, max_total - best_total), 2)
    else:
        naive = _shortest_path(
            topology,
            origin_node_id,
            best_node.id,
            telemetry_map,
            incident_nodes,
            accessible_only=accessible_only,
            ignore_congestion=True,
        )
        naive_walk = naive[2] if naive else best_walk
        time_saved = round(max(0.0, naive_walk - best_walk), 2)

    steps, waypoints_3d = _build_steps_and_waypoints(
        best_path, node_map, edge_lookup, telemetry_map, incident_nodes
    )

    alternatives: list[AlternativeFacility] = []
    for _, _, wait_min, cand, _ in evaluated[:4]:
        telem = telemetry_map.get(cand.id)
        alternatives.append(
            AlternativeFacility(
                node_id=cand.id,
                name=cand.name,
                estimated_wait_min=round(wait_min, 2),
                congestion_score=telem.congestion_score if telem else 0.0,
            )
        )

    origin_node = node_map[origin_node_id]
    resolved_user_pos = user_position or UserPosition3D(
        x=origin_node.x,
        y=origin_node.y,
        z=origin_node.z,
        level=origin_node.level,
        heading_deg=0.0,
        snapped_node_id=origin_node.id,
    )
    target_beacon = TargetBeacon(
        node_id=best_node.id,
        label=best_node.name,
        x=best_node.x,
        y=best_node.y,
        z=best_node.z,
        level=best_node.level,
    )

    return FanGuidanceResponse(
        venue_id=topology.venue_id,
        generated_at=datetime.now(timezone.utc).isoformat(),
        origin_node_id=origin_node_id,
        destination_node_id=target_id or best_node.id,
        recommended_target_id=best_node.id,
        user_position=resolved_user_pos,
        target_beacon=target_beacon,
        estimated_total_min=round(best_walk + best_wait, 2),
        estimated_wait_min=round(best_wait, 2),
        estimated_walk_min=round(best_walk, 2),
        time_saved_min=time_saved,
        accessible_only=accessible_only,
        route_node_ids=best_path,
        steps=steps,
        waypoints_3d=waypoints_3d,
        alternatives=alternatives,
    )
