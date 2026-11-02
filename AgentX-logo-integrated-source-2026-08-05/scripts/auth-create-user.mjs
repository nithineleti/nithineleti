#!/usr/bin/env node
// Creates (or repairs) an AgentX sign-in account directly, bypassing the
// confirmation email entirely.
//
// Needs the Supabase SERVICE ROLE key. It is prompted for at run time, used in
// memory, and never written to disk -- that key bypasses row-level security, so
// it must not sit in a file or scroll through a chat window.
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const ENV = new URL("../.env.local", import.meta.url);

function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = function (chunk) {
        if (chunk.includes(question)) rl.output.write(question);
        else rl.output.write("*");
      };
    }
    rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(a.trim()); });
  });
}

if (!process.stdin.isTTY) {
  console.error("  Run this directly in a terminal:  npm run auth:create-user");
  process.exit(1);
}

const env = {};
try {
  const raw = await readFile(ENV, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[2].trim()) env[m[1]] = m[2].trim();
  }
} catch {
  console.error("  .env.local not found.");
  process.exit(1);
}

const base = (env.NEXT_PUBLIC_SUPABASE_URL || "")
  .trim().replace(/\/+$/, "").replace(/\/(rest|auth|graphql|storage|realtime)\/v1$/i, "");
if (!base) {
  console.error("  NEXT_PUBLIC_SUPABASE_URL is not set in .env.local.");
  process.exit(1);
}

console.log("\n  Create an AgentX account (skips the confirmation email)");
console.log("  Supabase dashboard -> Settings -> API -> service_role / secret key");
console.log("  It is used once here and never saved.\n");

const key = await ask("  SERVICE ROLE key (masked): ", true);
if (!key) { console.error("\n  No key entered."); process.exit(1); }
if (key.startsWith("sb_publishable_") || key.includes("\"role\":\"anon\"")) {
  console.error("\n  That looks like the publishable/anon key. The service_role key is the secret one.");
  process.exit(1);
}
const email = await ask("  Email: ");
const password = await ask("  Password (min 8, masked): ", true);
if (!email || password.length < 8) {
  console.error("\n  Need an email and a password of at least 8 characters.");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };

async function findUser() {
  const r = await fetch(`${base}/auth/v1/admin/users?per_page=200`, { headers });
  if (!r.ok) return null;
  const body = await r.json().catch(() => ({}));
  const users = body.users || body || [];
  return (Array.isArray(users) ? users : []).find(
    (u) => (u.email || "").toLowerCase() === email.toLowerCase(),
  ) || null;
}

console.log("\n  Working...");
let res = await fetch(`${base}/auth/v1/admin/users`, {
  method: "POST",
  headers,
  body: JSON.stringify({ email, password, email_confirm: true }),
});

if (res.status === 401 || res.status === 403) {
  console.error("  Supabase rejected that key. Make sure it is the service_role key.");
  process.exit(1);
}

if (!res.ok) {
  // Most likely the address already exists from an earlier, unconfirmed signup.
  const existing = await findUser();
  if (!existing) {
    const body = await res.text();
    console.error(`  Could not create the account (${res.status}). ${body.slice(0, 200)}`);
    process.exit(1);
  }
  console.log("  Account already exists - confirming it and resetting the password instead.");
  const fix = await fetch(`${base}/auth/v1/admin/users/${existing.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!fix.ok) {
    console.error(`  Could not repair the account (${fix.status}).`);
    process.exit(1);
  }
}

console.log(`\n  Done. ${email} is confirmed and ready.`);
console.log("  Sign in at http://localhost:5500/login  ->  Continue with email\n");
