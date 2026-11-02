#!/usr/bin/env bash
set -e
python -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
PORT=${PORT:-8000}
uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
