"""Smoke tests for disha_intelligence scaffold."""

import pytest
from disha_intelligence.engine import compute_congestion_score


def test_compute_congestion_score_clamping() -> None:
    assert compute_congestion_score(0, 100) == 0.0
    assert compute_congestion_score(50, 100) == 0.5
    assert compute_congestion_score(150, 100) == 1.0


def test_compute_congestion_score_invalid_capacity() -> None:
    with pytest.raises(ValueError):
        compute_congestion_score(10, 0)
