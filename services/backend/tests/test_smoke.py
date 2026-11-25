"""Smoke tests for disha_backend app factory."""

import unittest

from disha_backend.main import app


class SmokeTests(unittest.TestCase):
    def test_app_initialized(self) -> None:
        self.assertIsNotNone(app)
        route_paths = {getattr(r, "path", "") for r in app.routes}
        self.assertIn("/health", route_paths)
        self.assertIn("/api/v1/venue/topology", route_paths)
        self.assertIn("/api/v1/routing/recommend", route_paths)
        self.assertIn("/ws/ops", route_paths)
        self.assertIn("/ws/fan", route_paths)
