#!/usr/bin/env node
// Prompts for the Vapi keys and writes them into .env.local.
// Keys are typed in your own terminal, so they never appear in a chat
// transcript. The private key is masked as you type.
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

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
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

let text = "";
try {
  text = await readFile(ENV, "utf8");
} catch {
  console.error("  .env.local not found. Run: cp .env.example .env.local");
  process.exit(1);
}

const current = (name) => (text.match(new RegExp("^" + name + "=(.*)$", "m")) || [])[1] || "";
function setKey(name, value) {
  if (!value) return;
  const re = new RegExp("^" + name + "=.*$", "m");
  text = re.test(text) ? text.replace(re, name + "=" + value) : text.trimEnd() + "\n" + name + "=" + value + "\n";
}

if (!process.stdin.isTTY) {
  console.error("  This needs an interactive terminal (it prompts for your keys).");
  console.error("  Run it directly:  npm run vapi:connect");
  process.exit(1);
}

console.log("\n  Connect this project to Vapi");
console.log("  Both keys live at: https://dashboard.vapi.ai  ->  Settings  ->  API Keys\n");

const priv = await ask("  PRIVATE key (masked): ", true);
const pub = await ask("  PUBLIC key: ", false);

if (priv && pub && priv === pub) {
  console.error("\n  Those are identical. The private and public keys differ - re-check the dashboard.");
  process.exit(1);
}
if (!priv) {
  console.error("\n  No private key entered. Nothing saved.");
  process.exit(1);
}

setKey("VAPI_PRIVATE_KEY", priv);
setKey("VAPI_PUBLIC_KEY", pub);
if (!current("VAPI_WEBHOOK_SECRET")) {
  setKey("VAPI_WEBHOOK_SECRET", randomBytes(40).toString("base64url"));
  console.log("  Generated VAPI_WEBHOOK_SECRET for you.");
}

await writeFile(ENV, text);
console.log("\n  Saved to .env.local (gitignored). Verifying...\n");
spawnSync("node", [new URL("./vapi-check.mjs", import.meta.url).pathname], { stdio: "inherit" });
