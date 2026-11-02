import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { createdAgents } from "../../../../db/schema";
import { getAgentXUser } from "../../../auth";
import { getVapiConfig, vapiFetch } from "../../../vapi";
import { enforceRequestLimit } from "../../request-limiter";

export const runtime = "edge";

type Payload = { agentId?: string; toNumber?: string };

/**
 * Places an outbound phone call from one of the tenant's own agents.
 * The agent must belong to the signed-in user, so a caller cannot dial out
 * using somebody else's assistant or phone number.
 */
export async function POST(request: Request) {
  const limited = await enforceRequestLimit(request, {
    scope: "vapi-outbound",
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const user = await getAgentXUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  const config = await getVapiConfig();
  if (!config) return Response.json({ error: "Voice platform is not connected." }, { status: 503 });

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const agentId = payload.agentId?.trim().slice(0, 80) || "";
  const toNumber = payload.toNumber?.replace(/[^\d+]/g, "").slice(0, 20) || "";
  if (!agentId || !/^\+\d{8,19}$/.test(toNumber)) {
    return Response.json(
      { error: "An agent and a number in international format are required." },
      { status: 400 },
    );
  }

  const db = await getDb();
  const rows = await db
    .select()
    .from(createdAgents)
    .where(and(eq(createdAgents.id, agentId), eq(createdAgents.ownerEmail, user.email.toLowerCase())))
    .limit(1);
  const agent = rows[0];
  if (!agent) return Response.json({ error: "Agent not found." }, { status: 404 });
  if (!agent.vapiAssistantId) {
    return Response.json(
      { error: "This agent has not been published to the phone network yet." },
      { status: 409 },
    );
  }

  const created = await vapiFetch<{ id?: string }>(config, "/call", {
    method: "POST",
    body: {
      assistantId: agent.vapiAssistantId,
      customer: { number: toNumber },
      ...(agent.vapiPhoneNumber ? { phoneNumberId: agent.vapiPhoneNumber } : {}),
    },
  });
  if (!created.ok) return Response.json({ error: created.error }, { status: created.status });

  return Response.json({ ok: true, callId: created.data?.id ?? null });
}
