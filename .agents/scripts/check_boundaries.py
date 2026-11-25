"""Verify that local Git changes stay strictly inside the active developer's module."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from identify_dev import REPO_ROOT, load_ownership, resolve_developer


def get_changed_paths(staged_only: bool = False) -> list[tuple[str, str]]:
    """Return list of (status_code, posix_relative_path) for modified/untracked files."""
    if staged_only:
        res = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "diff", "--cached", "--name-status", "-z"],
            capture_output=True,
            check=False,
        )
        if res.returncode != 0:
            return []
        tokens = [t for t in res.stdout.decode("utf-8", errors="replace").split("\0") if t]
        changed: list[tuple[str, str]] = []
        i = 0
        while i < len(tokens):
            code = tokens[i]
            if code.startswith(("R", "C")) and i + 2 < len(tokens):
                changed.append((code, tokens[i + 2].replace("\\", "/")))
                i += 3
            elif i + 1 < len(tokens):
                changed.append((code, tokens[i + 1].replace("\\", "/")))
                i += 2
            else:
                i += 1
        return changed

    res = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "status", "--porcelain=v1", "-z", "-uall"],
        capture_output=True,
        check=False,
    )
    if res.returncode != 0:
        return []

    raw_entries = res.stdout.decode("utf-8", errors="replace").split("\0")
    changed = []
    i = 0
    while i < len(raw_entries):
        entry = raw_entries[i]
        if not entry:
            i += 1
            continue
        status_code = entry[:2]
        path_str = entry[3:].replace("\\", "/")
        if ("R" in status_code or "C" in status_code) and i + 1 < len(raw_entries):
            changed.append((status_code, path_str))
            i += 2
        else:
            changed.append((status_code, path_str))
            i += 1
    return changed


def starts_with_any(path: str, prefixes: list[str]) -> bool:
    """Return True if path equals or resides inside any directory prefix."""
    for prefix in prefixes:
        norm_prefix = prefix.rstrip("/")
        if path == norm_prefix or path.startswith(norm_prefix + "/"):
            return True
    return False


def main() -> int:
    """Validate changed paths against module ownership rules."""
    parser = argparse.ArgumentParser(description="Check D.I.S.H.A. module ownership boundaries.")
    parser.add_argument(
        "--staged",
        action="store_true",
        help="Check only staged Git changes instead of full working tree.",
    )
    parser.add_argument(
        "--allow-shared",
        action="store_true",
        help="Allow modifications to shared coordination paths (contracts/, docs/, .agents/, root).",
    )
    args = parser.parse_args()

    ownership = load_ownership()
    handle, _, git_info = resolve_developer(ownership)
    if not handle:
        print("ERROR: Could not resolve active developer from Git config or .agents/.local-dev.")
        print("Run `python .agents/scripts/identify_dev.py` for setup instructions.")
        return 2

    dev = ownership["developers"][handle]
    owned_paths: list[str] = dev["owned_paths"]
    forbidden_paths: list[str] = dev.get("forbidden_paths", [])
    own_status_file: str = dev["status_file"]
    own_directive_file: str = dev.get("directive_file", f".agents/sync/directives/{handle}.md")
    handoffs_dir: str = ownership["shared_coordination"]["handoffs_dir"]
    protected_shared: list[str] = ownership["shared_coordination"]["protected_shared_paths"]

    changed = get_changed_paths(staged_only=args.staged)
    if not changed:
        print(f"OK [{handle}]: No modified files detected.")
        return 0

    peer_violations: list[str] = []
    shared_blocks: list[str] = []
    allowed_files: list[str] = []

    for status_code, path in changed:
        # 1. Hard block: explicit forbidden paths (e.g. simulator lock) or peer owned files
        if starts_with_any(path, forbidden_paths):
            peer_violations.append(f"  - {path} (forbidden for {handle})")
            continue

        violated_peer = None
        for other_handle, other_info in ownership["developers"].items():
            if other_handle == handle:
                continue
            other_directive = other_info.get(
                "directive_file", f".agents/sync/directives/{other_handle}.md"
            )
            if (
                starts_with_any(path, other_info["owned_paths"])
                or path == other_info["status_file"]
                or path == other_directive
            ):
                violated_peer = other_handle
                break
        if violated_peer:
            peer_violations.append(f"  - {path} (owned by {violated_peer})")
            continue

        # 2. Always allow own module paths, own status file, & own directive file
        if starts_with_any(path, owned_paths) or path in (own_status_file, own_directive_file):
            allowed_files.append(path)
            continue

        # 3. Allow creating new handoffs in .agents/sync/handoffs/
        if path.startswith(handoffs_dir) and path.endswith(".md"):
            if status_code[0] in ("?", "A"):
                allowed_files.append(path)
                continue

        # 4. Shared / protected paths
        if starts_with_any(path, protected_shared) or "/" not in path:
            if args.allow_shared:
                allowed_files.append(f"{path} [shared-approved]")
            else:
                shared_blocks.append(f"  - {path} (shared/protected path)")
            continue

        # Any unexpected top-level path
        if args.allow_shared:
            allowed_files.append(f"{path} [shared-approved]")
        else:
            shared_blocks.append(f"  - {path} (outside owned module)")

    if git_info["user.name"].lower() not in (
        handle.lower(),
        *[a.lower() for a in dev.get("aliases", [])],
    ):
        print(
            f"WARNING: git config user.name ('{git_info['user.name']}') does not match {handle}."
        )

    if allowed_files:
        print(f"Verified owned files for {handle} ({len(allowed_files)}):")
        for f in allowed_files:
            print(f"  + {f}")

    if peer_violations:
        print("\nBOUNDARY VIOLATION — Cannot modify peer developer files:")
        print("\n".join(peer_violations))

    if shared_blocks:
        print("\nSHARED PATH GATE — Requires explicit coordination (--allow-shared):")
        print("\n".join(shared_blocks))
        print("Tip: For API/schema requests, create a new file in .agents/sync/handoffs/ instead.")

    if peer_violations or shared_blocks:
        return 1

    print(f"\nPASS: All {len(allowed_files)} change(s) are within {handle}'s permitted scope.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
