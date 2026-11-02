import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { conversationEvents, conversations, createdAgents, usageEvents } from "../../../../db/schema";
import { runToolAction } from "../../tool-actions";
import { getVapiConfig, secretMatches, usdToPaise } from "../../../vapi";

export const runtime = "edge";

type VapiMessage = {
  type?: string;
  call?: { id?: string; assistantId?: string; startedAt?: string; endedAt?: string; cost?: number };
  toolCalls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>;
  artifact?: { transcript?: string };
  endedReason?: string;
  durationSeconds?: number;
};

/** Resolves the tenant for a Vapi call via the assistant that answered it. */
async function ownerForAssistant(assistantId: string) {
  if (!assistantId) return null;
  const db = await getDb();
  const rows = await db
    .select({ ownerEmail: createdAgents.ownerEmail, id: createdAgents.id })
    .from(createdAgents)
    .where(eq(createdAgents.vapiAssistantId, assistantId))
    .limit(1);
  return rows[0] ?? null;
}

/** Ensures a conversations row exists for this Vapi call, owned by the tenant. */
async function ensureConversation(callId: string, ownerEmail: string) {
  const db = await getDb();
  await db
    .insert(conversations)
    .values({ id: callId, channel: "phone", consentGiven: true, ownerEmail })
    .onConflictDoNothing();
}

export async function POST(request: Request) {
  const config = await getVapiConfig();
  if (!config) {
    return Response.json({ error: "Voice platform is not configured." }, { status: 503 });
  }

  // Vapi echoes the shared secret back on every webhook. Reject anything else:
  // this endpoint writes customer records, so it must not be openly callable.
  const presented =
    request.headers.get("x-vapi-secret") || request.headers.get("x-vapi-signature") || "";
  if (!config.webhookSecret || !secretMatches(config.webhookSecret, presented)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { message?: VapiMessage };
  try {
    body = (await request.json()) as { message?: VapiMessage };
  } catch {
    return Response.json({ error: "Invalid payload." }, { status: 400 });
  }

  const message = body.message || {};
  const callId = message.call?.id || "";
  const assistantId = message.call?.assistantId || "";
  const owner = await ownerForAssistant(assistantId);
  const ownerEmail = owner?.ownerEmail || "";

  // ---- Tool calls: the agent wants to save a lead / booking / handoff -------
  if (message.type === "tool-calls") {
    if (!owner) {
      return Response.json({ error: "Unknown assistant." }, { status: 404 });
    }
    await ensureConversation(callId, ownerEmail);

    const results = [];
    for (const call of message.toolCalls || []) {
      const name = call.function?.name || "";
      let args: Record<string, unknown> = {};
      const raw = call.function?.arguments;
      if (typeof raw === "string") {
        try {
          args = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          args = {};
        }
      } else if (raw && typeof raw === "object") {
        args = raw as Record<string, unknown>;
      }

      let result;
      try {
        result = await runToolAction(name, args, { conversationId: callId, ownerEmail });
      } catch (error) {
        result = {
          ok: false,
          error: error instanceof Error ? error.message : "The business system is unavailable.",
        };
      }
      results.push({ toolCallId: call.id, result: JSON.stringify(result) });
    }
    return Response.json({ results });
  }

  // ---- End of call: persist the transcript and record billable usage --------
  if (message.type === "end-of-call-report") {
    if (!owner) return Response.json({ ok: true });
    await ensureConversation(callId, ownerEmail);
    const db = await getDb();

    const transcript = message.artifact?.transcript || "";
    if (transcript) {
      await db.insert(conversationEvents).values({
        id: crypto.randomUUID(),
        conversationId: callId,
        role: "system",
        eventType: "phone.transcript",
        content: transcript.slice(0, 4000),
        ownerEmail,
      });
    }

    // Duration drives plan enforcement, so derive it defensively.
    let seconds = Math.max(0, Math.round(message.durationSeconds || 0));
    if (!seconds && message.call?.startedAt && message.call?.endedAt) {
      seconds = Math.max(
        0,
        Math.round(
          (Date.parse(message.call.endedAt) - Date.parse(message.call.startedAt)) / 1000,
        ),
      );
    }
    await db.insert(usageEvents).values({
      id: crypto.randomUUID(),
      agentId: owner.id,
      ownerEmail,
      eventType: "phone.call.minutes",
      // Round up: a 10-second call still consumes a billable minute.
      quantity: Math.max(1, Math.ceil(seconds / 60)),
      // Vapi bills in USD; this column is paise.
      costPaise: await usdToPaise(message.call?.cost || 0),
    });

    await db
      .update(conversations)
      .set({ status: "ended", endedAt: new Date().toISOString() })
      .where(eq(conversations.id, callId));

    return Response.json({ ok: true });
  }

  // status-update and other informational events need no action.
  return Response.json({ ok: true });
}
