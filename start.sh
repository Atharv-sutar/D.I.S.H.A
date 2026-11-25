#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="$(command -v python3 || command -v python)"
"$PYTHON_BIN" "$SCRIPT_DIR/scripts/start_disha.py" "$@"
