#!/usr/bin/env bash
# Exposes the local dev server so Vapi's webhooks can reach it.
set -uo pipefail
PORT="${PORT:-5500}"

if ! curl -s -o /dev/null --max-time 5 "http://localhost:${PORT}/"; then
  echo "Nothing is serving on port ${PORT}. Start it first:  npm run dev" >&2
  exit 1
fi

if command -v cloudflared >/dev/null 2>&1; then
  echo "Starting a public tunnel to localhost:${PORT} ..."
  echo "Copy the https://... URL below and set it as the assistant's server URL:"
  echo "    <that-url>/api/vapi/webhook"
  echo
  exec cloudflared tunnel --url "http://localhost:${PORT}"
elif command -v ngrok >/dev/null 2>&1; then
  exec ngrok http "${PORT}"
else
  echo "Install cloudflared or ngrok to expose the webhook." >&2
  exit 1
fi
