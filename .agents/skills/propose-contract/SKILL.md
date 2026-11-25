---
name: propose-contract
description: >-
  Use when one developer module needs a new REST endpoint, WebSocket message field,
  or stadium schema change from another developer's layer without editing peer code.
---

# Cross-Module Contract Proposal Runbook

Never edit another developer's code folder to fix an integration gap. Use this workflow instead.

## Steps

1. **Inspect Existing Contracts**:
   Review `contracts/openapi/README.md` and `contracts/schemas/*.schema.json` to see if the field or endpoint already exists.

2. **Create an Immutable Handoff Proposal**:
   Create a new file at:
   `.agents/sync/handoffs/YYYYMMDD-<your-github-handle>-<short-topic>.md`
   Include:
   - **From**: `<your-github-handle>` (`<your-module>`)
   - **To**: `<target-github-handle>` (`<target-module>`)
   - **Status**: `PROPOSED`
   - **Why Needed**: Problem/UI/engine requirement
   - **Proposed Contract / JSON Payload / Endpoint**: Exact field names, types, and example JSON
   - **Backward Compatibility**: Whether additive or breaking

3. **Record & Push**:
   Reference the new handoff filename in your `.agents/sync/status/<your-github-handle>.md`, run `python .agents/scripts/check_boundaries.py`, commit, and push so your teammate's agent picks it up on their next sync.
