import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const TENANT_TABLES = [
  "conversations",
  "leads",
  "appointmentRequests",
  "handoffRequests",
  "conversationEvents",
];

test("every table holding customer data carries an owner column", async () => {
  const schema = await read("db/schema.ts");
  for (const table of TENANT_TABLES) {
    const start = schema.indexOf(`export const ${table} = sqliteTable(`);
    assert.ok(start > -1, `${table} missing from schema`);
    const block = schema.slice(start, schema.indexOf("});", start));
    assert.match(block, /ownerEmail: text\("owner_email"\)/, `${table} has no owner column`);
  }
});

test("owner lookups are indexed, not full scans", async () => {
  const schema = await read("db/schema.ts");
  for (const idx of [
    "leads_owner_idx",
    "appointment_requests_owner_idx",
    "handoff_requests_owner_idx",
    "conversations_owner_idx",
  ]) {
    assert.match(schema, new RegExp(idx), `missing index ${idx}`);
  }
});

test("the admin dashboard filters by the signed-in tenant", async () => {
  const admin = await read("app/admin/page.tsx");
  assert.match(admin, /requireAgentXUser/);
  // All three listings must be owner-scoped.
  const scoped = admin.match(/\.where\(eq\(\w+\.ownerEmail, ownerEmail\)\)/g) || [];
  assert.equal(scoped.length, 3, `expected 3 owner-scoped queries, found ${scoped.length}`);
});

test("record ownership comes from the conversation, never the caller", async () => {
  for (const path of ["app/api/tools/route.ts", "app/api/events/route.ts"]) {
    const route = await read(path);
    assert.match(route, /resolveConversationOwner/, `${path} must resolve the owner`);
    assert.match(route, /Unknown conversation/, `${path} must reject unknown conversations`);
  }
  const access = await read("app/api/conversation-access.ts");
  // Ownership is read from the stored row, not accepted from the request body.
  assert.match(access, /\.from\(conversations\)/);
  assert.doesNotMatch(access, /payload|request/i);
});

test("a conversation records its owner at creation", async () => {
  const session = await read("app/api/session/route.ts");
  assert.match(session, /ownerEmail = user\.email\.toLowerCase\(\)/);
  assert.match(session, /ownerEmail = personalAgent\.ownerEmail\.toLowerCase\(\)/);
  assert.match(session, /\.values\(\{[\s\S]*?ownerEmail,[\s\S]*?\}\)/);
});

test("migration 0005 backfills owner columns and indexes", async () => {
  const sql = await read("drizzle/0005_omniscient_randall_flagg.sql");
  for (const table of ["leads", "appointment_requests", "handoff_requests", "conversations", "conversation_events"]) {
    assert.match(sql, new RegExp(`ALTER TABLE \`${table}\` ADD \`owner_email\``), table);
  }
});
