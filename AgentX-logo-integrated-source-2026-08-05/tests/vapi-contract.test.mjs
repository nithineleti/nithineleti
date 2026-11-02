import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("the private key never reaches the browser", async () => {
  for (const p of ["app/voice-agent.tsx", "app/access/page.tsx", "app/studio/studio.tsx", "app/login/page.tsx"]) {
    const client = await read(p);
    assert.doesNotMatch(client, /VAPI_PRIVATE_KEY/, `${p} must not reference the private key`);
  }
  const account = await read("app/api/vapi/account/route.ts");
  // The account summary may expose the PUBLIC key only.
  assert.doesNotMatch(account, /privateKey:\s*config\.privateKey/);
});

test("the webhook rejects unsigned requests", async () => {
  const hook = await read("app/api/vapi/webhook/route.ts");
  assert.match(hook, /secretMatches\(config\.webhookSecret/);
  assert.match(hook, /status: 401/);
  // Verification must happen before any database write. Measure the call site,
  // not the import line at the top of the file.
  const authIdx = hook.indexOf("secretMatches(config.webhookSecret");
  const writeIdx = hook.indexOf("await runToolAction(");
  assert.ok(authIdx > 0, "secret check missing");
  assert.ok(writeIdx > 0, "tool execution missing");
  assert.ok(authIdx < writeIdx, "secret check must precede tool execution");
});

test("the webhook secret is compared in constant time", async () => {
  const vapi = await read("app/vapi.ts");
  assert.match(vapi, /diff \|= expected\.charCodeAt\(i\) \^ received\.charCodeAt\(i\)/);
});

test("phone calls are attributed to the owning tenant, not the caller", async () => {
  const hook = await read("app/api/vapi/webhook/route.ts");
  assert.match(hook, /ownerForAssistant/);
  assert.match(hook, /createdAgents\.vapiAssistantId/);
  assert.match(hook, /ownerEmail,/);
});

test("web and phone channels share one set of business rules", async () => {
  const actions = await read("app/api/tool-actions.ts");
  const hook = await read("app/api/vapi/webhook/route.ts");
  const web = await read("app/api/tools/route.ts");
  // Consent gate lives in the shared module so neither channel can skip it.
  assert.match(actions, /consentConfirmed !== true/);
  assert.match(hook, /runToolAction/);
  assert.ok(
    web.includes("runToolAction") || web.includes("consentConfirmed !== true"),
    "web channel must still enforce consent",
  );
});

test("call minutes are recorded for billing", async () => {
  const hook = await read("app/api/vapi/webhook/route.ts");
  assert.match(hook, /usageEvents/);
  assert.match(hook, /phone\.call\.minutes/);
  assert.match(hook, /Math\.ceil\(seconds \/ 60\)/);
});

test("outbound calls are scoped to agents the user owns", async () => {
  const call = await read("app/api/vapi/call/route.ts");
  assert.match(call, /eq\(createdAgents\.ownerEmail, user\.email\.toLowerCase\(\)\)/);
  assert.match(call, /enforceRequestLimit/);
});

test("publishing refuses to register a webhook Vapi cannot reach", async () => {
  const route = await read("app/api/vapi/publish/route.ts");
  assert.match(route, /PUBLIC_APP_URL/);
  assert.match(route, /url\.protocol !== "https:"/);
  assert.match(route, /localhost/);
  assert.match(route, /webhook_unreachable/);
  // the guard must run before the assistant is created in Vapi
  assert.ok(route.indexOf("webhook_unreachable") < route.indexOf('"/assistant"'));
});

test("the studio can publish an agent to a phone line", async () => {
  const studio = await read("app/studio/studio.tsx");
  assert.match(studio, /\/api\/vapi\/account/);
  assert.match(studio, /\/api\/vapi\/publish/);
  assert.match(studio, /Publish to phone/);
});

test("sign out actually ends the session", async () => {
  const studio = await read("app/studio/studio.tsx");
  assert.match(studio, /fetch\("\/api\/auth\/signout", \{ method: "POST" \}\)/);
  // a bare link to /login leaves the HttpOnly cookie alive
  assert.doesNotMatch(studio, /<Link href="\/login">Sign out<\/Link>/);
});
