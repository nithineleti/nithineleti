import assert from "node:assert/strict";
import test from "node:test";

// The generator that scaffolded this project injected a `codex-preview` meta
// tag into every server-rendered page. It must never reappear in production
// HTML, so this test asserts its absence rather than its presence.
const scaffoldingMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])[^>]*>/i;

async function renderHomePage() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the home page as HTML", async () => {
  const response = await renderHomePage();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(await response.text(), /<title>[^<]*AgentX/i);
});

test("ships no build-scaffolding metadata to visitors", async () => {
  const html = await (await renderHomePage()).text();

  assert.doesNotMatch(html, scaffoldingMeta);
  assert.doesNotMatch(html, /codex|openai/i);
});

test("resolves fonts to real asset URLs, not build-container paths", async () => {
  const html = await (await renderHomePage()).text();

  assert.doesNotMatch(html, /\/workspace\//);
});
