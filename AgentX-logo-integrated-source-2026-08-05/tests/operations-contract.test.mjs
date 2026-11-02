import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const ROUTE = "app/api/operations/route.ts";
const CLIENT = "app/admin/live-operations.tsx";

/** Splits route source into one chunk per `db.select(...)` chain. */
function selectChains(source) {
  const starts = [...source.matchAll(/\.select\(/g)].map((m) => m.index);
  return starts.map((start, i) => source.slice(start, starts[i + 1] ?? source.length));
}

test("operations API requires a signed-in user and answers 401 without one", async () => {
  const route = await read(ROUTE);
  assert.match(route, /import \{ getAgentXUser \} from "\.\.\/\.\.\/auth"/);
  assert.match(route, /const user = await getAgentXUser\(\);\s*if \(!user\) return json\([^)]*\{ status: 401 \}\)/);
  // Authentication happens before any database work.
  assert.ok(route.indexOf("getAgentXUser()") < route.indexOf("getDb()"), "auth must run before the DB is touched");
});

test("operations API derives the tenant from the session, never from the request", async () => {
  const route = await read(ROUTE);
  assert.match(route, /const ownerEmail = user\.email\.toLowerCase\(\)/);
  assert.doesNotMatch(route, /searchParams\.get\("(owner|email|ownerEmail)"\)/);
  assert.doesNotMatch(route, /request\.json\(\)/);
});

test("every operations query is filtered by ownerEmail", async () => {
  const route = await read(ROUTE);
  const chains = selectChains(route);
  assert.ok(chains.length >= 7, `expected listing + summary queries, found ${chains.length}`);
  for (const chain of chains) {
    assert.match(chain, /\.where\(/, `select without a where clause:\n${chain.slice(0, 160)}`);
    assert.match(chain, /eq\(\w+\.ownerEmail, ownerEmail\)/, `select not owner-scoped:\n${chain.slice(0, 160)}`);
  }
  // A `since` filter must be combined with the owner filter, never replace it.
  for (const table of ["leads", "appointmentRequests", "handoffRequests"]) {
    assert.match(
      route,
      new RegExp(`and\\(eq\\(${table}\\.ownerEmail, ownerEmail\\), gt\\(${table}\\.createdAt, sinceValue\\)\\)`),
      `${table} since-filter is not owner-scoped`,
    );
  }
  assert.match(route, /eq\(usageEvents\.eventType, "phone\.call\.minutes"\)/);
});

test("operations API validates the since cursor", async () => {
  const route = await read(ROUTE);
  assert.match(route, /searchParams\.get\("since"\)/);
  assert.match(route, /ISO_INSTANT\.test\(raw\)/);
  assert.match(route, /status: 400/);
});

test("operations API is rate limited and never cached", async () => {
  const route = await read(ROUTE);
  assert.match(route, /enforceRequestLimit\(request, \{\s*scope: "operations"/);
  assert.match(route, /"Cache-Control": "no-store"/);
  // The helper that applies no-store is used for every response, including errors.
  assert.equal((route.match(/Response\.json\(/g) || []).length, 1, "only the no-store json() helper may build responses");
  assert.match(route, /serverTime:/);
});

test("live operations client pauses when the tab is hidden and stops on 401", async () => {
  const client = await read(CLIENT);
  assert.match(client, /^"use client";/);
  assert.match(client, /addEventListener\("visibilitychange"/);
  assert.match(client, /removeEventListener\("visibilitychange"/);
  assert.match(client, /document\.visibilityState === "hidden"/);
  assert.match(client, /response\.status === 401/);
  assert.match(client, /Signed out — sign in again/);
  assert.match(client, /\/api\/operations\?since=/);
});

test("live operations client backs off, cleans up and announces politely", async () => {
  const client = await read(CLIENT);
  assert.match(client, /MAX_BACKOFF_MS = 60_000/);
  assert.match(client, /2 \*\* \(failuresRef\.current - 1\)/);
  assert.match(client, /cancelAnimationFrame\(/);
  assert.match(client, /clearInterval\(/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /prefers-reduced-motion: reduce/);
  const css = await read("app/admin/operations.module.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /tabular-nums/);
});
