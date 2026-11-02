#!/usr/bin/env node
// End-to-end health check: config, database, integrations and live endpoints.
// Read-only. Sends no emails and creates no records.
import { readFile } from "node:fs/promises";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", X = "\x1b[0m";
const rows = [];
const add = (area, name, state, detail = "") => rows.push({ area, name, state, detail });
const OK = "ok", MISS = "missing", WARN = "warn", FAIL = "fail";

const env = {};
try {
  const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[2].trim()) env[m[1]] = m[2].trim();
  }
} catch {
  console.error("  .env.local missing - run: cp .env.example .env.local");
  process.exit(1);
}

const BASE = process.env.APP_URL || "http://localhost:5500";
async function hit(path, init) {
  try {
    const r = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(20000) });
    return { status: r.status, json: await r.json().catch(() => null) };
  } catch {
    return { status: 0, json: null };
  }
}

// ---- 1. dev server ---------------------------------------------------------
const home = await hit("/");
if (home.status === 0) {
  add("Server", "dev server", FAIL, `nothing serving on ${BASE} - run: npm run dev`);
} else {
  add("Server", "dev server", OK, BASE);
  for (const p of ["/login", "/pricing", "/platform", "/access"]) {
    const r = await hit(p);
    add("Pages", p, r.status === 200 ? OK : FAIL, `HTTP ${r.status}`);
  }
  for (const p of ["/studio", "/admin"]) {
    const r = await hit(p);
    add("Pages", p, r.status === 307 || r.status === 200 ? OK : WARN, `HTTP ${r.status} (auth-gated)`);
  }
}

// ---- 2. identity -----------------------------------------------------------
const supaUrl = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
  .replace(/\/(rest|auth|graphql|storage|realtime)\/v1$/i, "");
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supaUrl || !anon) {
  add("Identity", "supabase config", MISS, "NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY");
} else {
  try {
    const r = await fetch(`${supaUrl}/auth/v1/settings`, { headers: { apikey: anon }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error();
    const s = await r.json();
    add("Identity", "supabase reachable", OK, supaUrl.replace(/^https:\/\//, ""));
    add("Identity", "email sign-in", s.external?.email ? OK : MISS, s.external?.email ? "" : "enable Email provider");
    add("Identity", "google sign-in", s.external?.google ? OK : MISS, s.external?.google ? "" : "optional");
    add("Identity", "phone OTP", s.external?.phone ? OK : MISS, s.external?.phone ? "" : "optional; needs SMS provider");
    add("Identity", "email confirmation", s.mailer_autoconfirm ? OK : WARN,
      s.mailer_autoconfirm ? "off - signup logs in immediately"
        : "ON - new accounts need the emailed link, and the free quota is small");
    add("Identity", "signups", s.disable_signup ? WARN : OK, s.disable_signup ? "disabled" : "open");
  } catch {
    add("Identity", "supabase reachable", FAIL, "could not reach the project");
  }
}

// ---- 3. voice platform -----------------------------------------------------
if (!env.VAPI_PRIVATE_KEY) {
  add("Voice", "vapi key", MISS, "run: npm run vapi:connect");
} else {
  const vbase = (env.VAPI_API_BASE_URL || "https://api.vapi.ai").replace(/\/+$/, "");
  const vget = async (p) => {
    try {
      const r = await fetch(vbase + p, { headers: { Authorization: `Bearer ${env.VAPI_PRIVATE_KEY}` }, signal: AbortSignal.timeout(20000) });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };
  const a = await vget("/assistant");
  if (!a) add("Voice", "vapi reachable", FAIL, "key rejected or network error");
  else {
    add("Voice", "vapi reachable", OK, `${a.length} assistant(s)`);
    const n = await vget("/phone-number");
    add("Voice", "phone number", n && n.length ? OK : MISS,
      n && n.length ? n.map((x) => x.number || x.id).join(", ") : "add or import a number");
    const f = await vget("/file");
    add("Voice", "knowledge base", f && f.length ? OK : WARN, `${(f || []).length} file(s)`);
  }
  add("Voice", "webhook secret", env.VAPI_WEBHOOK_SECRET ? OK : MISS,
    env.VAPI_WEBHOOK_SECRET ? "" : "webhook will reject every call");
  const pub = (env.PUBLIC_APP_URL || "").trim();
  add("Voice", "public webhook url", pub.startsWith("https://") ? OK : MISS,
    pub.startsWith("https://") ? pub : "needed to publish - run: npm run vapi:tunnel");
}

// ---- 4. other services -----------------------------------------------------
add("AI", "direct AI provider", env.AI_API_KEY ? OK : WARN,
  env.AI_API_KEY ? "" : "browser voice + blueprint generation are inactive");
add("Billing", "stripe", env.STRIPE_SECRET_KEY ? OK : MISS, env.STRIPE_SECRET_KEY ? "" : "checkout inactive");
add("Billing", "stripe webhook", WARN === WARN && env.STRIPE_WEBHOOK_SECRET ? WARN : MISS,
  "no handler implemented - subscriptions never update");
add("Billing", "usd->inr rate", env.PROVIDER_USD_TO_INR ? OK : WARN, env.PROVIDER_USD_TO_INR || "defaults to 88");

// ---- 5. live app endpoints -------------------------------------------------
if (home.status !== 0) {
  const h = await hit("/api/health");
  add("Runtime", "database binding", h.json?.databaseConfigured ? OK : FAIL, "D1");
  const pr = await hit("/api/auth/providers");
  add("Runtime", "/api/auth/providers", pr.status === 200 ? OK : FAIL, `HTTP ${pr.status}`);
  const wh = await hit("/api/vapi/webhook", {
    method: "POST", headers: { "content-type": "application/json", "x-vapi-secret": "wrong" },
    body: JSON.stringify({ message: { type: "tool-calls" } }),
  });
  add("Security", "webhook rejects forgery", wh.status === 401 || wh.status === 503 ? OK : FAIL, `HTTP ${wh.status}`);
  for (const p of ["/api/vapi/account", "/api/vapi/publish", "/api/vapi/call"]) {
    const r = await hit(p, { method: p === "/api/vapi/account" ? "GET" : "POST",
      headers: { "content-type": "application/json" }, body: p === "/api/vapi/account" ? undefined : "{}" });
    add("Security", `${p} needs auth`, r.status === 401 ? OK : FAIL, `HTTP ${r.status}`);
  }
}

// ---- report ----------------------------------------------------------------
const icon = { ok: `${G}OK  ${X}`, missing: `${Y}TODO${X}`, warn: `${Y}WARN${X}`, fail: `${R}FAIL${X}` };
let area = "";
console.log("");
for (const r of rows) {
  if (r.area !== area) { area = r.area; console.log(`  ${area}`); }
  console.log(`    ${icon[r.state]}  ${r.name.padEnd(26)} ${D}${r.detail}${X}`);
}
const fails = rows.filter((r) => r.state === FAIL).length;
const todo = rows.filter((r) => r.state === MISS).length;
console.log(`\n  ${fails ? R + fails + " failing" + X : G + "nothing failing" + X}, ${todo} still to configure\n`);
