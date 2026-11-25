"""Tests for CongestionForecaster and named matchday scenarios."""

import pytest
from disha_intelligence.forecaster import CongestionForecaster
from disha_intelligence.scenarios import SCENARIOS, build_scenario_simulator


def test_forecaster_predicts_rising_congestion_under_bottleneck() -> None:
    sim = build_scenario_simulator("halftime_rush", seed=42)
    forecaster = CongestionForecaster(window_size=6, tick_seconds=2.0)

    for _ in range(5):
        forecaster.record(sim.step())

    forecast = forecaster.forecast_node("concession_north_express")
    assert 0.0 <= forecast.predicted_5m_congestion <= 1.0
    assert 0.0 <= forecast.predicted_10m_congestion <= 1.0
    assert forecast.predicted_5m_wait_min >= 0.0
    assert forecast.will_breach_critical is True

    ranked = forecaster.forecast_all()
    assert len(ranked) == len(sim.topology.nodes)
    assert ranked[0].predicted_5m_congestion >= ranked[-1].predicted_5m_congestion


def test_unknown_scenario_raises_key_error() -> None:
    assert "matchday_ingress" in SCENARIOS
    with pytest.raises(KeyError):
        build_scenario_simulator("nonexistent_scenario")
