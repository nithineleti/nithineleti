#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -e './backend[dev]'
fi
PYTHONPATH=backend .venv/bin/python -m app.demo
