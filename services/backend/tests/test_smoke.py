"""Smoke tests for disha_backend scaffold."""

from disha_backend.main import build_health_payload


def test_build_health_payload() -> None:
    payload = build_health_payload()
    assert payload["service"] == "disha-backend"
    assert payload["status"] == "ok"
    assert "timestamp" in payload
