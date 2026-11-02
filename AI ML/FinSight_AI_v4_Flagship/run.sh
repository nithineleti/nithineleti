#!/usr/bin/env bash
set -euo pipefail
if [ ! -d .venv ]; then
  python -m venv .venv
fi
. .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
mkdir -p runtime
alembic upgrade head
PORT=${PORT:-8000}
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
