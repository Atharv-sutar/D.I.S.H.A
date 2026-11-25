# Team Git & Antigravity IDE Sync Workflow

## 1. Module Isolation Rules

Each developer owns one top-level technical layer:

| Developer | GitHub | Owned Folder | Tech Stack |
| :--- | :--- | :--- | :--- |
| Atharv Sutar | `Atharv-sutar` | `services/backend/` | Python / FastAPI / WebSockets |
| Shreyas DM | `Shreyas-D-M` | `services/intelligence/` | Python / Crowd Sim / Routing / Alerts |
| Ankit Navi | `Ankit-Navi-8294` | `apps/` | TypeScript / Next.js / React |

No developer (and no developer's Antigravity IDE agent) modifies files inside another developer's folder.

## 2. How Antigravity Auto-Detects Your Role

When you open `D.I.S.H.A.` in Antigravity IDE on your laptop:
- Antigravity automatically discovers `AGENTS.md` and `.agents/rules/*.md`.
- `.agents/rules/00-identity-and-boundaries.md` instructs the agent to run `python .agents/scripts/identify_dev.py`.
- `identify_dev.py` reads your local `git config user.name` / `user.email` (or `.agents/.local-dev`) and resolves your exact profile from `.agents/ownership.json`.
- Your agent immediately knows which directory you own, which directories are off-limits, and reads your two teammates' status files in `.agents/sync/status/`.

### First-Time Setup on Shreyas's & Ankit's Laptops

```bash
git clone https://github.com/Atharv-sutar/D.I.S.H.A..git
cd D.I.S.H.A.

# Configure your Git identity so commits and agent detection work automatically:
git config user.name "<Your-GitHub-Handle>"   # Shreyas-D-M OR Ankit-Navi-8294
git config user.email "<Your-GitHub-Email>"

# Verify identity & read peers' sync status:
python .agents/scripts/identify_dev.py
```

## 3. Daily Sync -> Code -> Verify -> Push Loop

1. **Before coding**:
   - Pull latest changes: `git pull --rebase origin main`
   - Run `python .agents/scripts/identify_dev.py` or invoke the `session-sync` skill in Antigravity.
   - Check `.agents/sync/status/*.md` and `.agents/sync/handoffs/` for peer updates.
2. **While coding**:
   - Edit only files in your owned module (`services/backend/`, `services/intelligence/`, or `apps/`).
   - Need a new field or endpoint from a teammate? Create `.agents/sync/handoffs/YYYYMMDD-<handle>-<topic>.md` instead of editing their code.
3. **After coding (Mandatory Push)**:
   - Run your module's tests (`pytest` / `npm run lint` & `npm run typecheck`).
   - Run `python .agents/scripts/check_boundaries.py`.
   - Update **only** your own `.agents/sync/status/<Your-GitHub-Handle>.md`.
   - Commit with your GitHub username tag and push:
     ```bash
     git add <your-owned-folder> .agents/sync/status/<Your-GitHub-Handle>.md
     git commit -m "feat(<module>): <what changed> [<Your-GitHub-Handle>]"
     git pull --rebase origin main
     git push
     ```
