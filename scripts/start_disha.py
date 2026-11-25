"""Single-command launcher for the entire D.I.S.H.A. platform."""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def find_python_for(service_dir: Path) -> str:
    """Return service-local venv python if present, otherwise current sys.executable."""
    candidates = [
        service_dir / ".venv" / "Scripts" / "python.exe",
        service_dir / ".venv" / "bin" / "python",
    ]
    for cand in candidates:
        if cand.exists():
            return str(cand)
    return sys.executable


def can_import(python_exe: str, modules: list[str], extra_pythonpath: Path | None = None) -> bool:
    """Check whether all required modules import cleanly under python_exe."""
    env = os.environ.copy()
    if extra_pythonpath:
        env["PYTHONPATH"] = str(extra_pythonpath)
    stmt = "; ".join(f"import {m}" for m in modules)
    res = subprocess.run(
        [python_exe, "-c", stmt],
        env=env,
        capture_output=True,
        check=False,
    )
    return res.returncode == 0


def stream_logs(prefix: str, proc: subprocess.Popen[str]) -> None:
    """Forward child stdout/stderr lines with a clean service prefix."""
    assert proc.stdout is not None
    for line in iter(proc.stdout.readline, ""):
        if not line:
            break
        print(f"[{prefix}] {line.rstrip()}")


def wait_for_http(url: str, timeout_sec: float = 45.0) -> bool:
    """Poll a URL until it returns HTTP < 500 or timeout expires."""
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as resp:
                if resp.status < 500:
                    return True
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(0.5)
    return False


def terminate_process_tree(proc: subprocess.Popen[str]) -> None:
    """Terminate a child process and its descendants cleanly across Windows & POSIX."""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
            capture_output=True,
            check=False,
        )
    else:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except OSError:
            proc.terminate()


def ensure_npm_deps(app_dir: Path, npm_cmd: str) -> None:
    """Install node_modules automatically if missing on a fresh clone."""
    if (app_dir / "node_modules").exists():
        return
    print(f"[setup] Installing npm dependencies in {app_dir.name}...")
    subprocess.run([npm_cmd, "install"], cwd=str(app_dir), check=True)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Launch all D.I.S.H.A. services and open the 3D Stadium apps in browser."
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Start all servers without automatically opening browser tabs.",
    )
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Run Next.js apps with `npm run start` instead of `npm run dev`.",
    )
    args = parser.parse_args()

    npm_cmd = shutil.which("npm.cmd" if os.name == "nt" else "npm") or shutil.which("npm")
    if not npm_cmd:
        print("ERROR: `npm` was not found in PATH. Install Node.js 18+ first.")
        return 1

    backend_dir = REPO_ROOT / "services" / "backend"
    intel_dir = REPO_ROOT / "services" / "intelligence"
    ops_dir = REPO_ROOT / "apps" / "ops-dashboard"
    fan_dir = REPO_ROOT / "apps" / "fan-app"

    ensure_npm_deps(ops_dir, npm_cmd)
    ensure_npm_deps(fan_dir, npm_cmd)

    backend_py = find_python_for(backend_dir)
    if not can_import(backend_py, ["fastapi", "uvicorn", "pydantic"], backend_dir / "src"):
        print("ERROR: Backend dependencies missing. Run `pip install -e services/backend` first.")
        return 1

    processes: list[tuple[str, subprocess.Popen[str]]] = []
    popen_kwargs: dict[str, object] = {
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
        "text": True,
        "bufsize": 1,
    }
    if os.name == "nt":
        popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    else:
        popen_kwargs["start_new_session"] = True

    def launch(name: str, cmd: list[str], cwd: Path, extra_env: dict[str, str] | None = None) -> None:
        env = os.environ.copy()
        if extra_env:
            env.update(extra_env)
        proc = subprocess.Popen(cmd, cwd=str(cwd), env=env, **popen_kwargs)  # type: ignore[arg-type]
        processes.append((name, proc))
        t = threading.Thread(target=stream_logs, args=(name, proc), daemon=True)
        t.start()

    try:
        print("=== Starting D.I.S.H.A. Smart Stadium Platform ===")

        # 1. Core Backend (FastAPI + WebSockets on port 8000)
        launch(
            "backend",
            [backend_py, "-m", "disha_backend.main"],
            backend_dir,
            {
                "PYTHONPATH": str(backend_dir / "src"),
                "DISHA_AUTO_STREAM": "true",
                "PYTHONUNBUFFERED": "1",
            },
        )

        # 2. Optional Intelligence Engine + Publisher (port 8001 -> ingests to 8000)
        intel_py = find_python_for(intel_dir)
        if can_import(intel_py, ["disha_intelligence", "networkx", "httpx"], intel_dir / "src"):
            launch(
                "intel-srv",
                [intel_py, "-m", "disha_intelligence.server", "--port", "8001"],
                intel_dir,
                {"PYTHONPATH": str(intel_dir / "src"), "PYTHONUNBUFFERED": "1"},
            )
            launch(
                "intel-pub",
                [intel_py, "-m", "disha_intelligence.publisher", "--scenario", "matchday_ingress"],
                intel_dir,
                {"PYTHONPATH": str(intel_dir / "src"), "PYTHONUNBUFFERED": "1"},
            )
        else:
            print("[intelligence] Optional packages not installed in this env; using backend live stream.")

        # 3. Frontend Apps (Ops Dashboard :3000 & Fan 3D App :3001)
        next_script = "start" if args.prod else "dev"
        launch("ops-ui", [npm_cmd, "run", next_script], ops_dir)
        launch("fan-ui", [npm_cmd, "run", next_script], fan_dir)

        print("Waiting for services to become ready...")
        backend_ok = wait_for_http("http://127.0.0.1:8000/health", timeout_sec=25.0)
        ops_ok = wait_for_http("http://localhost:3000", timeout_sec=45.0)
        fan_ok = wait_for_http("http://localhost:3001", timeout_sec=45.0)

        print(
            f"Readiness -> Backend(8000): {'OK' if backend_ok else 'WAIT'} | "
            f"Ops(3000): {'OK' if ops_ok else 'WAIT'} | "
            f"Fan(3001): {'OK' if fan_ok else 'WAIT'}"
        )

        if not args.no_browser:
            print("Launching D.I.S.H.A. 3D apps in your browser...")
            webbrowser.open("http://localhost:3001")
            time.sleep(0.6)
            webbrowser.open("http://localhost:3000")

        print("\nD.I.S.H.A. is running!")
        print("  - Fan 3D Navigation App : http://localhost:3001")
        print("  - Ops 3D Command Center : http://localhost:3000")
        print("  - Backend Swagger Docs  : http://localhost:8000/docs")
        print("Press Ctrl+C to stop all services.\n")

        while True:
            time.sleep(1.0)
            for name, proc in processes:
                code = proc.poll()
                if code is not None:
                    print(f"[{name}] exited with code {code}")
                    if name in ("backend", "ops-ui", "fan-ui"):
                        return code

    except KeyboardInterrupt:
        print("\nShutting down all D.I.S.H.A. services...")
    finally:
        for _, proc in reversed(processes):
            terminate_process_tree(proc)

    return 0


if __name__ == "__main__":
    sys.exit(main())
