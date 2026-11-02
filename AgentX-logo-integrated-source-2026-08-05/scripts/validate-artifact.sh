#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
migrations="${SITES_PROJECT_ROOT}/dist/migrations"

[[ -f "${worker}" ]] || {
  echo "Missing Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -d "${migrations}" ]] || {
  echo "Missing packaged migrations: dist/migrations" >&2
  exit 66
}

node --input-type=module - "${worker}" "${migrations}" <<'NODE'
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [workerPath, migrationsPath] = process.argv.slice(2);

const sql = (await readdir(migrationsPath)).filter((name) => name.endsWith(".sql"));
if (sql.length === 0) {
  throw new Error("dist/migrations contains no .sql migration files");
}

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("artifact-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
}
NODE

echo "Validated artifact: ESM Worker default.fetch and packaged migrations are present."
