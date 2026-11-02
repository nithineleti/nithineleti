import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { createdAgents } from "../../../db/schema";
import { enforceRequestLimit } from "../request-limiter";

const clean = (value: unknown, max = 160) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

async function hashAccessKey(key: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return bytesToHex(new Uint8Array(digest));
}

export async function POST(request: Request) {
  try {
    const limited = await enforceRequestLimit(request, {
      scope: "agent-access",
      maxRequests: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (limited) return limited;
    const body = (await request.json()) as { agentId?: string; accessKey?: string };
    const agentId = clean(body.agentId, 80);
    const accessKey = clean(body.accessKey, 120);
    if (!agentId || !accessKey) {
      return Response.json({ error: "Agent ID and access key are required." }, { status: 400 });
    }
    const rows = await (await getDb())
      .select()
      .from(createdAgents)
      .where(eq(createdAgents.id, agentId))
      .limit(1);
    const agent = rows[0];
    if (!agent || !agent.accessKeyHash || (await hashAccessKey(accessKey)) !== agent.accessKeyHash) {
      return Response.json({ error: "The AgentX credentials are not valid." }, { status: 401 });
    }
    return Response.json({
      ok: true,
      agent: {
        id: agent.id,
        name: agent.name,
        businessName: agent.businessName,
        agentType: agent.agentType,
        primaryGoal: agent.primaryGoal,
        languages: agent.languages,
        voice: agent.voice,
        tone: agent.tone,
        channels: agent.channels,
        capabilities: agent.capabilities,
        integrations: agent.integrations,
        welcomeMessage: agent.welcomeMessage,
        status: agent.status,
      },
    });
  } catch {
    return Response.json({ error: "Agent access is temporarily unavailable." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const limited = await enforceRequestLimit(request, {
      scope: "agent-access-update",
      maxRequests: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (limited) return limited;
    const body = (await request.json()) as {
      agentId?: string;
      accessKey?: string;
      name?: string;
      primaryGoal?: string;
      languages?: string;
      voice?: string;
      tone?: string;
      welcomeMessage?: string;
    };
    const agentId = clean(body.agentId, 80);
    const accessKey = clean(body.accessKey, 120);
    const db = await getDb();
    const rows = await db.select().from(createdAgents).where(eq(createdAgents.id, agentId)).limit(1);
    const current = rows[0];
    if (!current || !current.accessKeyHash || (await hashAccessKey(accessKey)) !== current.accessKeyHash) {
      return Response.json({ error: "The AgentX credentials are not valid." }, { status: 401 });
    }
    const allowedVoices = new Set(["marin", "cedar", "coral", "alloy", "ash", "ballad", "echo", "sage", "shimmer", "verse"]);
    const voice = clean(body.voice, 40);
    await db.update(createdAgents).set({
      name: clean(body.name, 160) || current.name,
      primaryGoal: clean(body.primaryGoal, 500) || current.primaryGoal,
      languages: clean(body.languages, 500) || current.languages,
      voice: allowedVoices.has(voice) ? voice : current.voice,
      tone: clean(body.tone, 160) || current.tone,
      welcomeMessage: clean(body.welcomeMessage, 800) || current.welcomeMessage,
      status: "ready",
    }).where(eq(createdAgents.id, agentId));
    return Response.json({ ok: true, message: "Your personal AgentX was updated." });
  } catch {
    return Response.json({ error: "The agent could not be updated." }, { status: 500 });
  }
}
