"""Congestion-aware NetworkX wayfinding & facility recommendation engine."""

from __future__ import annotations

from datetime import UTC

import networkx as nx

from disha_intelligence.models import (
    FanGuidanceResponse,
    NodeTelemetry,
    NodeType,
    RouteStep,
    StadiumTopology,
    TargetAlternative,
    TelemetrySnapshot,
    TopologyNode,
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
    ) -> nx.DiGraph:
        graph = nx.DiGraph()
        for node in self.topology.nodes:
            tel = telemetry_map.get(node.id)
            if node.status == "closed" or (tel and tel.status == "closed"):
                continue
            if accessible_only and not node.accessible:
                continue
            graph.add_node(node.id, node=node)

        for edge in self.topology.edges:
            if accessible_only and not edge.accessible:
                continue
            if edge.from_node not in graph or edge.to_node not in graph:
                continue

            self._add_weighted_edge(
                graph, edge.from_node, edge.to_node, edge.distance_m, telemetry_map, walking_speed_mps
            )
            if edge.bidirectional:
                self._add_weighted_edge(
                    graph,
                    edge.to_node,
                    edge.from_node,
                    edge.distance_m,
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
        telemetry_map: dict[str, NodeTelemetry],
        walking_speed_mps: float,
    ) -> None:
        v_tel = telemetry_map.get(v)
        v_cong = v_tel.congestion_score if v_tel else 0.0
        base_walk_min = (distance_m / walking_speed_mps) / 60.0
        effective_walk_min = base_walk_min * (1.0 + 1.2 * (v_cong**2))
        graph.add_edge(u, v, weight=effective_walk_min, distance_m=distance_m)

    def recommend(
        self,
        origin_node_id: str,
        snapshot: TelemetrySnapshot,
        target_type: NodeType | None = None,
        target_id: str | None = None,
        accessible_only: bool = False,
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
        graph = self._build_graph(telemetry_map, accessible_only, speed_mps)

        if origin_node_id not in graph:
            raise ValueError(f"Origin node '{origin_node_id}' is closed or inaccessible")

        candidates: list[TopologyNode] = []
        for node in self.topology.nodes:
            if node.id not in graph:
                continue
            if node.type == resolved_type:
                candidates.append(node)

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

        # Baseline: shortest physical-distance candidate (what naive routing would pick)
        baseline_total = max(
            evaluated,
            key=lambda item: -sum(
                float(graph[item[3][i]][item[3][i + 1]]["distance_m"])
                for i in range(len(item[3]) - 1)
            ),
        )[0]
        time_saved = round(max(0.0, baseline_total - best_total), 2)

        steps = self._build_steps(best_path, graph)
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
            estimated_total_min=round(best_total, 2),
            estimated_wait_min=round(best_wait, 2),
            estimated_walk_min=round(best_walk, 2),
            time_saved_min=time_saved,
            accessible_only=accessible_only,
            route_node_ids=best_path,
            steps=steps,
            alternatives=alternatives,
        )

    def _build_steps(self, path: list[str], graph: nx.DiGraph) -> list[RouteStep]:
        steps: list[RouteStep] = []
        for idx, node_id in enumerate(path):
            node = self._node_map[node_id]
            if idx == 0:
                steps.append(
                    RouteStep(
                        order=1,
                        node_id=node_id,
                        instruction=f"Start at {node.name} (Level {node.level}).",
                        distance_m=0.0,
                    )
                )
            else:
                prev_id = path[idx - 1]
                prev_node = self._node_map[prev_id]
                dist_m = float(graph[prev_id][node_id]["distance_m"])
                if node.level != prev_node.level:
                    verb = f"Take level transition to Level {node.level} at {node.name}"
                elif idx == len(path) - 1:
                    verb = f"Arrive at {node.name}"
                else:
                    verb = f"Continue via {node.name}"
                steps.append(
                    RouteStep(
                        order=idx + 1,
                        node_id=node_id,
                        instruction=f"{verb} ({dist_m:.0f} m).",
                        distance_m=round(dist_m, 1),
                    )
                )
        return steps
