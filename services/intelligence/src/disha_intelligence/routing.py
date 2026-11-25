"""Congestion-aware NetworkX wayfinding & facility recommendation engine."""

from __future__ import annotations

import math
from datetime import UTC

import networkx as nx

from disha_intelligence.models import (
    FanGuidanceResponse,
    NodeTelemetry,
    NodeType,
    RouteMode,
    RouteStep,
    StadiumTopology,
    TargetAlternative,
    TargetBeacon,
    TelemetrySnapshot,
    TopologyNode,
    UserPosition3D,
    Waypoint3D,
    WaypointType,
)
from disha_intelligence.topology import build_default_topology


class WayfindingEngine:
    """Finds optimal stadium gates/facilities minimizing combined walk + queue wait time."""

    def __init__(self, topology: StadiumTopology | None = None) -> None:
        self.topology = topology or build_default_topology()
        self._node_map: dict[str, TopologyNode] = {n.id: n for n in self.topology.nodes}

    def _build_graph(
        self,
        telemetry_map: dict[str, NodeTelemetry],
        accessible_only: bool,
        walking_speed_mps: float,
        avoid_surged_gates: bool = True,
        allowed_surged_ids: set[str] | None = None,
    ) -> nx.DiGraph:
        allowed = allowed_surged_ids or set()
        graph = nx.DiGraph()
        for node in self.topology.nodes:
            tel = telemetry_map.get(node.id)
            if node.status == "closed" or (tel and tel.status == "closed"):
                continue
            if accessible_only and not node.accessible:
                continue
            if (
                avoid_surged_gates
                and node.type == "gate"
                and node.id not in allowed
                and tel is not None
                and (tel.congestion_score >= 0.80 or tel.status == "critical")
            ):
                continue
            graph.add_node(node.id, node=node)

        for edge in self.topology.edges:
            if accessible_only and not edge.accessible:
                continue
            if edge.from_node not in graph or edge.to_node not in graph:
                continue

            dest_node = self._node_map[edge.to_node]
            self._add_weighted_edge(
                graph,
                edge.from_node,
                edge.to_node,
                edge.distance_m,
                dest_node.type,
                telemetry_map,
                walking_speed_mps,
            )
            if edge.bidirectional:
                rev_dest = self._node_map[edge.from_node]
                self._add_weighted_edge(
                    graph,
                    edge.to_node,
                    edge.from_node,
                    edge.distance_m,
                    rev_dest.type,
                    telemetry_map,
                    walking_speed_mps,
                )
        return graph

    @staticmethod
    def _add_weighted_edge(
        graph: nx.DiGraph,
        u: str,
        v: str,
        distance_m: float,
        dest_type: NodeType,
        telemetry_map: dict[str, NodeTelemetry],
        walking_speed_mps: float,
    ) -> None:
        v_tel = telemetry_map.get(v)
        v_cong = v_tel.congestion_score if v_tel else 0.0
        v_wait = v_tel.estimated_wait_min if v_tel else 0.0
        base_walk_min = (distance_m / walking_speed_mps) / 60.0

        # Priority 1: Gate traffic dominates edge cost; Priority 2: Stand & concourse congestion
        if dest_type == "gate":
            multiplier = 1.0 + 6.0 * (v_cong**2)
            delay_min = v_wait * 0.75 + (v_cong * 4.0 if v_cong >= 0.5 else 0.0)
        elif dest_type in ("seating_section", "concourse"):
            multiplier = 1.0 + 3.0 * (v_cong**2)
            delay_min = v_wait * 0.25
        else:
            multiplier = 1.0 + 2.0 * (v_cong**2)
            delay_min = 0.0

        effective_walk_min = (base_walk_min * multiplier) + delay_min
        graph.add_edge(u, v, weight=effective_walk_min, distance_m=distance_m)

    def recommend(
        self,
        origin_node_id: str,
        snapshot: TelemetrySnapshot,
        target_type: NodeType | None = None,
        target_id: str | None = None,
        accessible_only: bool = False,
        route_mode: RouteMode | None = None,
    ) -> FanGuidanceResponse:
        """Compute optimal target & route minimizing walk + wait time."""
        if origin_node_id not in self._node_map:
            raise ValueError(f"Unknown origin_node_id: {origin_node_id}")
        if target_id is None and target_type is None:
            raise ValueError("Either target_type or target_id must be provided")

        if target_id is not None:
            if target_id not in self._node_map:
                raise ValueError(f"Unknown target_id: {target_id}")
            resolved_type = target_type or self._node_map[target_id].type
        else:
            resolved_type = target_type  # type: ignore[assignment]

        telemetry_map = {n.node_id: n for n in snapshot.nodes}
        speed_mps = 1.05 if accessible_only else 1.25
        allowed_surged = {origin_node_id}
        if target_id is not None:
            allowed_surged.add(target_id)
        graph = self._build_graph(
            telemetry_map,
            accessible_only,
            speed_mps,
            avoid_surged_gates=True,
            allowed_surged_ids=allowed_surged,
        )

        if origin_node_id not in graph:
            raise ValueError(f"Origin node '{origin_node_id}' is closed or inaccessible")

        candidates: list[TopologyNode] = []
        for node in self.topology.nodes:
            if node.id not in graph:
                continue
            if node.type == resolved_type:
                if resolved_type == "gate" and route_mode == "entry":
                    if node.gate_role not in ("entry", "entry_exit", None):
                        continue
                elif (
                    resolved_type == "gate"
                    and route_mode == "exit"
                    and node.gate_role not in ("exit", "entry_exit", None)
                ):
                    continue
                candidates.append(node)

        if not candidates and resolved_type == "gate":
            # Fallback if every gate is surged
            graph = self._build_graph(
                telemetry_map, accessible_only, speed_mps, avoid_surged_gates=False
            )
            candidates = [
                n for n in self.topology.nodes if n.id in graph and n.type == "gate"
            ]

        if (
            target_id is not None
            and target_id in graph
            and all(c.id != target_id for c in candidates)
        ):
            candidates.append(self._node_map[target_id])

        if not candidates:
            raise ValueError(f"No reachable open candidates for type '{resolved_type}'")

        evaluated: list[tuple[float, float, float, list[str], TopologyNode]] = []
        for cand in candidates:
            try:
                path = nx.shortest_path(graph, origin_node_id, cand.id, weight="weight")
            except nx.NetworkXNoPath:
                continue

            walk_min = sum(
                float(graph[path[i]][path[i + 1]]["weight"]) for i in range(len(path) - 1)
            )
            tel = telemetry_map.get(cand.id)
            wait_min = tel.estimated_wait_min if tel else 0.0
            total_min = walk_min + wait_min
            evaluated.append((total_min, walk_min, wait_min, path, cand))

        if not evaluated:
            raise ValueError(
                f"No accessible path from '{origin_node_id}' to any '{resolved_type}'"
            )

        evaluated.sort(key=lambda item: item[0])
        best_total, best_walk, best_wait, best_path, best_node = evaluated[0]

        # Baseline: naive shortest-distance candidate (including any surged gate we bypassed)
        full_graph = self._build_graph(
            telemetry_map, accessible_only, speed_mps, avoid_surged_gates=False
        )
        naive_totals: list[tuple[float, float]] = []
        for node in self.topology.nodes:
            if node.id not in full_graph or node.type != resolved_type:
                continue
            try:
                n_path = nx.shortest_path(full_graph, origin_node_id, node.id, weight="distance_m")
            except nx.NetworkXNoPath:
                continue
            n_dist = sum(
                float(full_graph[n_path[i]][n_path[i + 1]]["distance_m"])
                for i in range(len(n_path) - 1)
            )
            n_walk = sum(
                float(full_graph[n_path[i]][n_path[i + 1]]["weight"])
                for i in range(len(n_path) - 1)
            )
            n_tel = telemetry_map.get(node.id)
            n_wait = n_tel.estimated_wait_min if n_tel else 0.0
            naive_totals.append((n_dist, n_walk + n_wait))

        if naive_totals:
            naive_totals.sort(key=lambda item: item[0])
            baseline_total = naive_totals[0][1]
        else:
            baseline_total = max(item[0] for item in evaluated)
        time_saved = round(max(0.0, baseline_total - best_total), 2)

        steps, waypoints_3d = self._build_steps_and_waypoints(best_path, graph)
        origin_node = self._node_map[origin_node_id]
        heading_deg = 0.0
        if len(best_path) > 1:
            next_node = self._node_map[best_path[1]]
            heading_deg = round(
                math.degrees(math.atan2(next_node.x - origin_node.x, next_node.y - origin_node.y))
                % 360.0,
                1,
            )

        user_position = UserPosition3D(
            x=origin_node.x,
            y=origin_node.y,
            z=origin_node.z,
            level=origin_node.level,
            heading_deg=heading_deg,
            snapped_node_id=origin_node_id,
        )
        target_beacon = TargetBeacon(
            node_id=best_node.id,
            label=best_node.name,
            x=best_node.x,
            y=best_node.y,
            z=best_node.z,
            level=best_node.level,
        )

        alternatives = [
            TargetAlternative(
                node_id=node.id,
                name=node.name,
                estimated_wait_min=round(wait_m, 2),
                congestion_score=(
                    telemetry_map[node.id].congestion_score if node.id in telemetry_map else 0.0
                ),
            )
            for _, _, wait_m, _, node in evaluated[1:5]
        ]

        destination_id = target_id if target_id is not None else best_node.id

        return FanGuidanceResponse(
            venue_id=self.topology.venue_id,
            generated_at=snapshot.timestamp.astimezone(UTC),
            origin_node_id=origin_node_id,
            destination_node_id=destination_id,
            recommended_target_id=best_node.id,
            user_position=user_position,
            target_beacon=target_beacon,
            estimated_total_min=round(best_total, 2),
            estimated_wait_min=round(best_wait, 2),
            estimated_walk_min=round(best_walk, 2),
            time_saved_min=time_saved,
            accessible_only=accessible_only,
            route_node_ids=best_path,
            steps=steps,
            waypoints_3d=waypoints_3d,
            alternatives=alternatives,
        )

    def _build_steps_and_waypoints(
        self, path: list[str], graph: nx.DiGraph
    ) -> tuple[list[RouteStep], list[Waypoint3D]]:
        steps: list[RouteStep] = []
        waypoints: list[Waypoint3D] = []
        for idx, node_id in enumerate(path):
            node = self._node_map[node_id]
            if idx == 0:
                instruction = f"Start at {node.name} (Level {node.level})."
                dist_m = 0.0
                wp_type: WaypointType = "origin"
            else:
                prev_id = path[idx - 1]
                prev_node = self._node_map[prev_id]
                dist_m = round(float(graph[prev_id][node_id]["distance_m"]), 1)
                if node.level != prev_node.level:
                    verb = f"Take level transition to Level {node.level} at {node.name}"
                    wp_type = "level_transition"
                elif idx == len(path) - 1:
                    verb = f"Arrive at {node.name}"
                    wp_type = "destination"
                else:
                    verb = f"Continue via {node.name}"
                    wp_type = "checkpoint"
                if idx == len(path) - 1 and node.level != prev_node.level:
                    wp_type = "destination"
                instruction = f"{verb} ({dist_m:.0f} m)."

            steps.append(
                RouteStep(
                    order=idx + 1,
                    node_id=node_id,
                    instruction=instruction,
                    distance_m=dist_m,
                )
            )
            waypoints.append(
                Waypoint3D(
                    order=idx + 1,
                    node_id=node_id,
                    x=node.x,
                    y=node.y,
                    z=node.z,
                    level=node.level,
                    waypoint_type=wp_type,
                    instruction=instruction,
                    distance_m=dist_m,
                )
            )
        return steps, waypoints
