"""Canonical M. Chinnaswamy Stadium 3D topology loader."""

from __future__ import annotations

import json
from pathlib import Path

from disha_intelligence.models import StadiumTopology

_DEFAULT_VENUE_PATH = (
    Path(__file__).resolve().parents[4] / "contracts" / "venues" / "chinnaswamy_stadium.json"
)


def load_topology_from_file(path: Path = _DEFAULT_VENUE_PATH) -> StadiumTopology:
    """Load and validate a StadiumTopology JSON file."""
    data = json.loads(path.read_text(encoding="utf-8"))
    return StadiumTopology.model_validate(data)


def build_default_topology() -> StadiumTopology:
    """Load the canonical 3D M. Chinnaswamy Stadium topology."""
    return load_topology_from_file(_DEFAULT_VENUE_PATH)
