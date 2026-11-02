import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("login page has no permanently disabled buttons", async () => {
  const login = await read("app/login/page.tsx");
  // `disabled` must always be bound to state, never hardcoded.
  assert.doesNotMatch(login, /\sdisabled>/);
  assert.match(login, /disabled=\{busy\}/);
});

test("every sign-in method reaches a real endpoint", async () => {
  const login = await read("app/login/page.tsx");
  assert.match(login, /\/api\/auth\/password/);
  assert.match(login, /\/api\/auth\/otp/);
  assert.match(login, /\/api\/auth\/authorize\?provider=google/);
});

test("session cookies are HttpOnly and SameSite-scoped", async () => {
  const session = await read("app/auth-session.ts");
  assert.match(session, /"HttpOnly"/);
  assert.match(session, /"SameSite=Lax"/);
  // Secure must be conditional so local http development still works.
  assert.match(session, /if \(isSecure\(request\)\) parts\.push\("Secure"\)/);
});

test("tokens are never exposed to browser JavaScript", async () => {
  for (const path of ["app/login/page.tsx", "app/voice-agent.tsx", "app/access/page.tsx"]) {
    const client = await read(path);
    assert.doesNotMatch(client, /document\.cookie/, `${path} must not touch cookies`);
    assert.doesNotMatch(client, /agentx_access_token/, `${path} must not read the session token`);
  }
});

test("OAuth uses PKCE with a single-use verifier", async () => {
  const authorize = await read("app/api/auth/authorize/route.ts");
  const callback = await read("app/api/auth/callback/route.ts");
  assert.match(authorize, /code_challenge_method/);
  assert.match(authorize, /S-?256|s256/i);
  assert.match(callback, /grant_type=pkce/);
  assert.match(callback, /code_verifier/);
});

test("open redirects are impossible on the auth paths", async () => {
  const session = await read("app/auth-session.ts");
  assert.match(session, /startsWith\("\/"\) && !value\.startsWith\("\/\/"\)/);
  for (const path of ["app/api/auth/authorize/route.ts", "app/api/auth/callback/route.ts"]) {
    assert.match(await read(path), /safeReturnPath/, `${path} must sanitise return_to`);
  }
});

test("session route authenticates before writing to the database", async () => {
  const route = await read("app/api/session/route.ts");
  const authIndex = route.indexOf("getAgentXUser()");
  const insertIndex = route.indexOf(".insert(conversations)");
  assert.ok(authIndex > 0, "session route must call getAgentXUser");
  assert.ok(
    authIndex < insertIndex,
    "auth check must run before the conversations insert",
  );
  // The old bypass trusted mere header presence. It must not come back.
  assert.doesNotMatch(route, /hasAgentXSession/);
  assert.match(route, /timingSafeEqual/);
});

test("the conversation id is server-generated, not client-supplied", async () => {
  const route = await read("app/api/session/route.ts");
  const client = await read("app/voice-agent.tsx");
  assert.doesNotMatch(route, /headers\.get\("x-conversation-id"\)/);
  assert.match(client, /response\.headers\.get\("x-conversation-id"\)/);
});

test("a Supabase URL pasted with an API path is normalised to the project root", async () => {
  const session = await read("app/auth-session.ts");
  assert.match(session, /export function normaliseSupabaseUrl/);
  assert.match(session, /\(rest\|auth\|graphql\|storage\|realtime\)\\\/v1\$/);
  // both entry points must use it, or one of them breaks on a pasted /rest/v1/
  assert.match(await read("app/auth.ts"), /normaliseSupabaseUrl\(env\.NEXT_PUBLIC_SUPABASE_URL\)/);
});

test("the login page only offers sign-in methods the provider has enabled", async () => {
  const login = await read("app/login/page.tsx");
  assert.match(login, /\/api\/auth\/providers/);
  assert.match(login, /\{providers\.google && \(/);
  assert.match(login, /\{providers\.phone && \(/);
  // defaults must be conservative: never advertise google/phone before confirmation
  assert.match(login, /google: false,\s*phone: false/);
});
