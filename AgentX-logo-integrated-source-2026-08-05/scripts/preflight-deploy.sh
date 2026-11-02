#!/usr/bin/env bash
# Fails fast on the things that silently break a first deploy.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
fail=0
say() { printf "  %-34s %s\n" "$1" "$2"; }

# 1. Cloudflare auth
if npx --no-install wrangler whoami 2>&1 | grep -qi "not authenticated"; then
  say "cloudflare auth" "MISSING  -> run: npx wrangler login"; fail=1
else
  say "cloudflare auth" "ok"
fi

# 2. Real D1 database id
if grep -q '"database_id": "00000000-0000-4000-8000-000000000000"' wrangler.jsonc; then
  say "d1 database_id" "PLACEHOLDER -> npx wrangler d1 create agentx-db"; fail=1
else
  say "d1 database_id" "ok"
fi

# 3. Secrets that must exist in the deployed Worker
missing=""
for name in AI_API_KEY AI_API_BASE_URL AI_REALTIME_MODEL AI_TRANSCRIPTION_MODEL \
            NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
  npx --no-install wrangler secret list 2>/dev/null | grep -q "\"$name\"" || missing="$missing $name"
done
if [ -n "$missing" ]; then
  say "worker secrets" "MISSING ->$missing"; fail=1
else
  say "worker secrets" "ok"
fi

# 4. Unapplied migrations are a hard outage: the rate limiter fails closed.
local_count=$(ls drizzle/*.sql 2>/dev/null | wc -l | tr -d ' ')
say "migrations to apply" "$local_count  -> npm run db:migrate:remote after deploy"

if [ "$fail" -ne 0 ]; then
  echo
  echo "Preflight failed. Fix the items above before deploying." >&2
  exit 1
fi
echo
echo "Preflight passed. Run: npm run deploy"
