import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("keeps the permanent API key out of the browser client", async () => {
  const client = await read("app/voice-agent.tsx");
  assert.doesNotMatch(client, /AI_API_KEY|OPENAI_API_KEY|sk-proj-/);
  assert.match(client, /fetch\("\/api\/session"/);
});

test("requires consent before starting a voice conversation", async () => {
  const client = await read("app/voice-agent.tsx");
  const server = await read("app/api/session/route.ts");
  assert.match(client, /if \(!consent\)/);
  assert.match(client, /x-recording-consent/);
  assert.match(server, /consentGiven/);
});

test("registers every production business tool", async () => {
  const config = await read("app/agent-config.ts");
  const tools = await read("app/api/tools/route.ts");
  for (const name of [
    "create_lead",
    "request_appointment",
    "request_human_handoff",
  ]) {
    assert.match(config, new RegExp(name));
    assert.match(tools, new RegExp(name));
  }
});

test("enables durable D1 storage and includes generated migration", async () => {
  const wrangler = await read("wrangler.jsonc");
  const viteConfig = await read("vite.config.ts");
  const migration = await read("drizzle/0000_huge_leo.sql");

  // Bindings must live only in wrangler.jsonc. If vite.config.ts also passed an
  // inline `config`, the plugin would concatenate the arrays and duplicate the
  // D1 binding in the deployed Worker.
  assert.match(wrangler, /"binding":\s*"DB"/);
  assert.match(wrangler, /"migrations_dir":\s*"drizzle"/);
  assert.doesNotMatch(viteConfig, /config:\s*localBindingConfig/);
  assert.match(migration, /CREATE TABLE `leads`/);
  assert.match(migration, /CREATE TABLE `appointment_requests`/);
  assert.match(migration, /CREATE TABLE `handoff_requests`/);
  assert.match(migration, /CREATE TABLE `conversation_events`/);
});

test("protects paid provider and credential routes with a shared request limit", async () => {
  const limiter = await read("app/api/request-limiter.ts");
  assert.match(limiter, /crypto\.subtle\.digest/);
  assert.match(limiter, /requestLimits/);
  assert.match(limiter, /status:\s*429/);
  assert.match(limiter, /status:\s*503/);
  assert.match(await read("drizzle/0006_request_limit_guard.sql"), /CREATE TABLE `request_limits`/);
  for (const path of [
    "app/api/session/route.ts",
    "app/api/agents/route.ts",
    "app/api/voice-preview/route.ts",
    "app/api/agent-access/route.ts",
  ]) {
    assert.match(await read(path), /enforceRequestLimit/, `${path} is not rate limited`);
  }
});

test("renders the voice-agent visual with Three.js instead of a static placeholder", async () => {
  const avatar = await read("app/voice-avatar.tsx");
  const home = await read("app/voice-agent.tsx");
  assert.match(avatar, /from "three"/);
  assert.match(avatar, /WebGLRenderer/);
  assert.match(avatar, /pointermove/);
  assert.match(home, /<VoiceAvatar active=/);
});
