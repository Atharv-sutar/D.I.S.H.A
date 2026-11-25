# D.I.S.H.A. Congestion, Alert Analytics & Simulation (`services/intelligence/`)

**Owner**: [@Shreyas-D-M](https://github.com/Shreyas-D-M)

## Responsibilities

- Synthetic stadium crowd & gate/concession queue simulator (ingress surges, halftime spikes, bottleneck injection).
- Real-time congestion scoring (`0.0` to `1.0`) and queue wait-time estimation.
- Congestion-aware shortest-total-time routing and alternative entrance/concession recommendations.
- Emerging incident anomaly detector emitting `AlertIncident` payloads to `services/backend/` (`Atharv-sutar`).

## Local Development Setup

```bash
cd services/intelligence
python -m venv .venv
# Windows: .venv\Scripts\activate  |  macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
```

## Running Tests

```bash
pytest
```
