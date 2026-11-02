#!/usr/bin/env node
// Verifies the Vapi connection and reports exactly what is still missing.
// Reads .env.local so keys never need to be pasted into a terminal or chat.
import { readFile } from "node:fs/promises";

const ok = (s) => `  \x1b[32m✓\x1b[0m ${s}`;
const no = (s) => `  \x1b[31m✗\x1b[0m ${s}`;
const dot = (s) => `    ${s}`;

const env = {};
try {
  const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[2].trim()) env[m[1]] = m[2].trim();
  }
} catch {
  console.error(no(".env.local not found — run: cp .env.example .env.local"));
  process.exit(1);
}

let fatal = false;

// --- 1. keys present and the right way round --------------------------------
const priv = env.VAPI_PRIVATE_KEY || "";
const pub = env.VAPI_PUBLIC_KEY || "";
const secret = env.VAPI_WEBHOOK_SECRET || "";

if (!priv) {
  console.log(no("VAPI_PRIVATE_KEY missing"));
  console.log(dot("Vapi dashboard → Settings → API Keys → copy the PRIVATE key"));
  fatal = true;
} else if (priv === pub) {
  console.log(no("VAPI_PRIVATE_KEY and VAPI_PUBLIC_KEY are the same value"));
  console.log(dot("These are two different keys. The private one must stay server-side."));
  fatal = true;
} else {
  console.log(ok("VAPI_PRIVATE_KEY present"));
}
if (!pub) console.log(no("VAPI_PUBLIC_KEY missing (needed later for in-browser calls)"));
else console.log(ok("VAPI_PUBLIC_KEY present"));

if (!secret) {
  console.log(no("VAPI_WEBHOOK_SECRET missing — the webhook will reject everything"));
  fatal = true;
} else if (secret.length < 24) {
  console.log(no(`VAPI_WEBHOOK_SECRET is only ${secret.length} chars — use 32+`));
} else {
  console.log(ok(`VAPI_WEBHOOK_SECRET present (${secret.length} chars)`));
}

if (fatal) {
  console.log("\n  Fix the above, then re-run: npm run vapi:check");
  process.exit(1);
}

// --- 2. can we actually reach the account? ----------------------------------
const base = (env.VAPI_API_BASE_URL || "https://api.vapi.ai").replace(/\/+$/, "");
async function get(path) {
  try {
    const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${priv}` } });
    if (!r.ok) return { error: `${r.status} ${r.statusText}` };
    return { data: await r.json() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unreachable" };
  }
}

const assistants = await get("/assistant");
if (assistants.error) {
  console.log(no(`Could not reach Vapi: ${assistants.error}`));
  if (String(assistants.error).startsWith("401"))
    console.log(dot("401 usually means you pasted the PUBLIC key into VAPI_PRIVATE_KEY."));
  process.exit(1);
}
console.log(ok("Connected to your Vapi account"));

const [numbers, files] = await Promise.all([get("/phone-number"), get("/file")]);
const n = (r) => (Array.isArray(r.data) ? r.data.length : 0);

console.log(`\n  Your account contains:`);
console.log(`    assistants     ${n(assistants)}`);
for (const a of (assistants.data || []).slice(0, 5)) console.log(`                   · ${a.name || a.id}`);
console.log(`    phone numbers  ${n(numbers)}`);
for (const p of (numbers.data || []).slice(0, 5)) console.log(`                   · ${p.number || p.id} (${p.provider || "vapi"})`);
console.log(`    kb files       ${n(files)}`);
for (const f of (files.data || []).slice(0, 5)) console.log(`                   · ${f.name || f.id}`);

// --- 3. what to do next -----------------------------------------------------
console.log(`\n  Next steps:`);
if (n(numbers) === 0)
  console.log(dot("No phone number yet → create one in Vapi (US free), or import your Twilio number for India."));
console.log(dot("Expose your webhook so Vapi can call back:  npm run vapi:tunnel"));
console.log(dot("Then publish an agent:  POST /api/vapi/publish  { \"agentId\": \"...\" }"));
