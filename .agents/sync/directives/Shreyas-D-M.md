# Autonomous Directives — `Shreyas-D-M` (`services/intelligence/`)

## Active Queue
- [DONE] Core intelligence & simulation engine (`topology.py`, `simulator.py`, `routing.py`, `detector.py`, `forecaster.py`, `scenarios.py`, `publisher.py`, `server.py`).
- [DONE] Migrate to M. Chinnaswamy Stadium 3D topology (`contracts/venues/chinnaswamy_stadium.json`), `pulse_intensity`, 3D `AlertIncident.position`, and `waypoints_3d`.
- [PENDING] Add `POST /fans/locate` or coordinate-based `user_x, user_y, user_level` parameter support to `services/intelligence/src/disha_intelligence/server.py` `/routing/recommend` so intelligence routing aligns 1:1 with `services/backend/`.
- [PENDING] Add live integration script/test verifying `SimulationPublisher` streams `TelemetrySnapshot` and `AlertIncident` payloads cleanly into `services/backend/` (`http://localhost:8000`) and ensure continuous match-day demo mode (`matchday_ingress` -> `halftime_rush` -> `egress`) triggers realistic holographic alerts.
- [PENDING] Check `.agents/sync/status/Atharv-sutar.md` and `.agents/sync/status/Ankit-Navi-8294.md` on every pull for any new cross-layer requests.
