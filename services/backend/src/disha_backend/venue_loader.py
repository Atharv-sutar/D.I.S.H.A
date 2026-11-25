"""Load canonical M. Chinnaswamy Stadium topology and snap 3D user coordinates."""

from __future__ import annotations

import json
import math
from pathlib import Path

from disha_backend.models import StadiumNode, StadiumTopology, UserPosition3D


DEFAULT_VENUE_REL = Path("contracts") / "venues" / "chinnaswamy_stadium.json"


def find_default_venue_path() -> Path:
    """Locate chinnaswamy_stadium.json relative to workspace root."""
    current = Path(__file__).resolve()
    for parent in current.parents:
        candidate = parent / DEFAULT_VENUE_REL
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        f"Could not locate canonical stadium topology at {DEFAULT_VENUE_REL}"
    )


def load_stadium_topology(venue_path: Path | None = None) -> StadiumTopology:
    """Load and validate the stadium topology JSON contract."""
    target = venue_path or find_default_venue_path()
    raw = json.loads(target.read_text(encoding="utf-8"))
    return StadiumTopology(**raw)


def snap_position_to_node(
    topology: StadiumTopology,
    x: float,
    y: float,
    z: float | None = None,
    level: int | None = None,
    heading_deg: float = 0.0,
) -> tuple[UserPosition3D, StadiumNode, float]:
    """Snap raw 3D coordinates to the closest open navigable stadium node."""
    candidates = [n for n in topology.nodes if n.status != "closed"]
    if level is not None:
        same_level = [n for n in candidates if n.level == level]
        if same_level:
            candidates = same_level

    if not candidates:
        candidates = topology.nodes

    best_node = candidates[0]
    best_dist = float("inf")
    for node in candidates:
        dz = (node.z - z) * 2.0 if z is not None else 0.0
        dist = math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2 + dz ** 2)
        if dist < best_dist:
            best_dist = dist
            best_node = node

    resolved_z = z if z is not None else best_node.z
    resolved_level = level if level is not None else best_node.level
    user_pos = UserPosition3D(
        x=round(x, 2),
        y=round(y, 2),
        z=round(resolved_z, 2),
        level=resolved_level,
        heading_deg=heading_deg,
        snapped_node_id=best_node.id,
    )
    return user_pos, best_node, round(best_dist, 2)
