# Cross-Agent Synchronization Ledger (`sync/`)

This folder keeps all three developers' Antigravity IDE agents synchronized via Git **without merge conflicts**.

## Rules

1. **`status/<github-username>.md`**:
   - Each developer's agent edits **ONLY its own file**.
   - Every agent reads **all three files** at session start to learn what teammates recently built, changed, or requested.
2. **`handoffs/YYYYMMDD-<author>-<topic>.md`**:
   - Append-only proposals for cross-layer REST endpoints, WebSocket payloads, or schema additions.
   - Never overwrite another developer's handoff file unless appending a short `Status: ACCEPTED / IMPLEMENTED by <handle>` note when explicitly closing it.
