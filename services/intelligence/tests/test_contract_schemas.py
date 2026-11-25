"""Contract conformance tests verifying payloads against contracts/schemas/*.schema.json."""

import json
from pathlib import Path

from disha_intelligence.detector import IncidentDetector
from disha_intelligence.routing import WayfindingEngine
from disha_intelligence.scenarios import build_scenario_simulator
from disha_intelligence.topology import build_default_topology

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMAS_DIR = REPO_ROOT / "contracts" / "schemas"


def _load_schema(filename: str) -> dict:
    return json.loads((SCHEMAS_DIR / filename).read_text(encoding="utf-8"))


def test_all_outputs_conform_to_json_schema_required_fields_and_enums() -> None:
    topology = build_default_topology()
    topo_schema = _load_schema("stadium_topology.schema.json")
    topo_data = topology.model_dump(mode="json")

    for req in topo_schema["required"]:
        assert req in topo_data
    node_types = set(topo_schema["properties"]["nodes"]["items"]["properties"]["type"]["enum"])
    for node in topo_data["nodes"]:
        assert node["type"] in node_types

    sim = build_scenario_simulator("halftime_rush", seed=42)
    detector = IncidentDetector(topology=topology)
    snapshot = None
    incidents = []
    for _ in range(4):
        snapshot = sim.step()
        incidents.extend(detector.analyze(snapshot))

    assert snapshot is not None
    tel_schema = _load_schema("telemetry_events.schema.json")
    tel_data = snapshot.model_dump(mode="json")
    for req in tel_schema["required"]:
        assert req in tel_data
    assert tel_data["event_phase"] in tel_schema["properties"]["event_phase"]["enum"]

    assert len(incidents) >= 1
    inc_schema = _load_schema("alert_incident.schema.json")
    inc_data = incidents[0].model_dump(mode="json")
    for req in inc_schema["required"]:
        assert req in inc_data
    assert inc_data["category"] in inc_schema["properties"]["category"]["enum"]
    assert inc_data["severity"] in inc_schema["properties"]["severity"]["enum"]
    assert inc_data["status"] in inc_schema["properties"]["status"]["enum"]

    engine = WayfindingEngine(topology)
    guidance = engine.recommend("transit_north_metro", snapshot, target_type="gate")
    guid_schema = _load_schema("fan_guidance.schema.json")
    guid_data = guidance.model_dump(mode="json")
    for req in guid_schema["required"]:
        assert req in guid_data
