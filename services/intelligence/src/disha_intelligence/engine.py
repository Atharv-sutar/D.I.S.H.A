"""Baseline interface stubs for congestion scoring and simulation ticks."""

from __future__ import annotations


def compute_congestion_score(occupancy: int, capacity: int) -> float:
    """Return normalized congestion index clamped between 0.0 and 1.0."""
    if capacity <= 0:
        raise ValueError("capacity must be positive")
    ratio = max(0.0, occupancy / capacity)
    return round(min(1.0, ratio), 4)
