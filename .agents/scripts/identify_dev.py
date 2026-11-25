"""Identify the active D.I.S.H.A. developer, check/pull remote sync status, and print peer logs."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
OWNERSHIP_FILE = REPO_ROOT / ".agents" / "ownership.json"
LOCAL_DEV_OVERRIDE = REPO_ROOT / ".agents" / ".local-dev"


def load_ownership() -> dict[str, Any]:
    """Load the shared ownership registry from .agents/ownership.json."""
    return json.loads(OWNERSHIP_FILE.read_text(encoding="utf-8"))


def run_git_result(*args: str) -> subprocess.CompletedProcess[str]:
    """Run a git command in REPO_ROOT and return the CompletedProcess."""
    return subprocess.run(
        ["git", "-C", str(REPO_ROOT), *args],
        capture_output=True,
        text=True,
        check=False,
    )


def run_git(*args: str) -> str:
    """Run a git command in REPO_ROOT and return stripped stdout, or '' on error."""
    result = run_git_result(*args)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def match_developer(candidate: str, developers: dict[str, Any]) -> str | None:
    """Match a candidate handle, alias, or email against ownership.json developers."""
    norm = candidate.strip().lower()
    if not norm:
        return None
    for handle, info in developers.items():
        if norm == handle.lower():
            return handle
        aliases = [a.lower() for a in info.get("aliases", [])]
        emails = [e.lower() for e in info.get("emails", [])]
        if norm in aliases or norm in emails:
            return handle
    return None


def resolve_developer(ownership: dict[str, Any]) -> tuple[str | None, str, dict[str, str]]:
    """Resolve the active developer handle and the detection source."""
    developers = ownership["developers"]
    git_info = {
        "user.name": run_git("config", "user.name"),
        "user.email": run_git("config", "user.email"),
        "branch": run_git("rev-parse", "--abbrev-ref", "HEAD"),
        "head": run_git("rev-parse", "--short", "HEAD"),
    }

    env_dev = os.environ.get("DISHA_DEV", "").strip()
    if env_dev:
        matched = match_developer(env_dev, developers)
        if matched:
            return matched, "env:DISHA_DEV", git_info

    if LOCAL_DEV_OVERRIDE.exists():
        override_val = LOCAL_DEV_OVERRIDE.read_text(encoding="utf-8").strip().splitlines()
        if override_val:
            matched = match_developer(override_val[0], developers)
            if matched:
                return matched, ".agents/.local-dev", git_info

    for key in ("user.name", "user.email"):
        matched = match_developer(git_info[key], developers)
        if matched:
            return matched, f"git:{key}", git_info

    return None, "unresolved", git_info


def sync_with_remote(pull: bool) -> str:
    """Fetch origin and optionally pull --rebase origin main if working tree is clean."""
    fetch_res = run_git_result("fetch", "origin")
    if fetch_res.returncode != 0:
        return f"Fetch skipped/failed: {fetch_res.stderr.strip() or 'offline'}"

    counts = run_git("rev-list", "--left-right", "--count", "HEAD...origin/main")
    ahead, behind = (0, 0)
    if counts and len(counts.split()) == 2:
        ahead, behind = (int(x) for x in counts.split())

    dirty = bool(run_git("status", "--porcelain"))
    if not pull:
        if behind > 0:
            return (
                f"BEHIND origin/main by {behind} commit(s) (ahead {ahead}). "
                "Run `git pull --rebase origin main` before starting any new task."
            )
        return f"Up to date with origin/main (ahead {ahead}, behind {behind})."

    if behind == 0:
        return f"Already up to date with origin/main (ahead {ahead})."

    if dirty:
        return (
            f"BLOCKED PULL: Local branch is behind origin/main by {behind} commit(s), "
            "but working tree has uncommitted changes. Stash or commit owned work before pulling."
        )

    pull_res = run_git_result("pull", "--rebase", "origin", "main")
    if pull_res.returncode != 0:
        return f"REBASE FAILED: {pull_res.stderr.strip() or pull_res.stdout.strip()}"
    return f"Pulled and rebased {behind} commit(s) from origin/main cleanly."


def print_peer_sync_summary(active_handle: str | None) -> None:
    """Display status headlines and open handoffs for cross-agent synchronization."""
    status_dir = REPO_ROOT / ".agents" / "sync" / "status"
    handoffs_dir = REPO_ROOT / ".agents" / "sync" / "handoffs"

    print("\n--- Peer Agent Sync Status ---")
    if status_dir.exists():
        for status_file in sorted(status_dir.glob("*.md")):
            marker = "(YOU)" if active_handle and status_file.stem == active_handle else "(PEER)"
            lines = [
                ln.strip()
                for ln in status_file.read_text(encoding="utf-8").splitlines()
                if ln.strip() and not ln.startswith("#")
            ]
            preview = " | ".join(lines[:3]) if lines else "No entries yet."
            print(f"  {status_file.stem} {marker}: {preview}")

    print("\n--- Recent Contract Handoffs ---")
    if handoffs_dir.exists():
        handoffs = sorted(handoffs_dir.glob("*.md"))
        if not handoffs:
            print("  (none)")
        for hf in handoffs[-5:]:
            print(f"  - .agents/sync/handoffs/{hf.name}")


def main() -> int:
    """CLI entrypoint for developer identity detection and sync overview."""
    parser = argparse.ArgumentParser(description="Identify active D.I.S.H.A. developer and check sync.")
    parser.add_argument(
        "--pull",
        action="store_true",
        help="Fetch origin and run `git pull --rebase origin main` when working tree is clean.",
    )
    parser.add_argument(
        "--no-fetch",
        action="store_true",
        help="Skip remote fetch check (offline mode).",
    )
    args = parser.parse_args()

    ownership = load_ownership()
    sync_msg = "Remote check skipped (--no-fetch)." if args.no_fetch else sync_with_remote(pull=args.pull)
    handle, source, git_info = resolve_developer(ownership)

    print("=== D.I.S.H.A. Developer Identity & Scope ===")
    print(f"Repository Root : {REPO_ROOT}")
    print(f"Git Branch/HEAD : {git_info['branch'] or '?'} @ {git_info['head'] or 'unborn'}")
    print(f"Remote Sync     : {sync_msg}")
    print(f"Git Config User : {git_info['user.name'] or '<unset>'} <{git_info['user.email'] or 'unset'}>")

    if not handle:
        print("Detected Dev    : UNKNOWN")
        print("\nACTION REQUIRED: Configure local Git identity to match one team profile:")
        for dev_handle, dev_info in ownership["developers"].items():
            print(f"  - {dev_handle} ({dev_info['display_name']}): owns {', '.join(dev_info['owned_paths'])}")
        print('Example: git config user.name "Shreyas-D-M"')
        return 2

    dev = ownership["developers"][handle]
    forbidden = [
        p
        for other_handle, other_info in ownership["developers"].items()
        if other_handle != handle
        for p in other_info["owned_paths"]
    ]
    print(f"Detected Dev    : {handle} ({dev['display_name']}) [via {source}]")
    print(f"Role            : {dev['role']}")
    print(f"Owned Paths     : {', '.join(dev['owned_paths'])}")
    print(f"Own Status File : {dev['status_file']}")
    print(f"Forbidden Paths : {', '.join(forbidden)}")

    recent_commits = run_git("log", "-n", "5", "--oneline")
    if recent_commits:
        print("\n--- Recent Commits ---")
        for line in recent_commits.splitlines():
            print(f"  {line}")

    print_peer_sync_summary(handle)
    return 0


if __name__ == "__main__":
    sys.exit(main())
