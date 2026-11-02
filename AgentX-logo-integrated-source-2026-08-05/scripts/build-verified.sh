#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

# Bound the build with GNU timeout where it exists. Linux CI always has it, so
# that path is unchanged. macOS ships no `timeout` at all; GNU coreutils installs
# it as `gtimeout`. If neither is present, build unbounded rather than refusing to
# build, so `npm run build` and `npm test` still work for local development.
timeout_command=""
if command -v timeout >/dev/null 2>&1; then
  timeout_command="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  timeout_command="gtimeout"
fi

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm ci (npm run install:ci on Linux CI) and wait for it to finish before building." >&2
  exit 69
fi

if [[ -n "${timeout_command}" ]]; then
  echo "Running bounded vinext build..."
  "${timeout_command}" \
    --signal=TERM \
    --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
    "${SITES_BUILD_TIMEOUT:-3m}" \
    "${vinext}" build
else
  echo "GNU timeout is unavailable; running an unbounded vinext build." >&2
  echo "Install GNU coreutils to restore the bounded build (macOS: brew install coreutils)." >&2
  "${vinext}" build
fi

"${script_dir}/validate-artifact.sh"
