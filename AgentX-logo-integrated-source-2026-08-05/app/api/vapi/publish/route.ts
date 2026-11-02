import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { createdAgents } from "../../../../db/schema";
import { getAgentXUser } from "../../../auth";
import { getRuntimeEnv } from "../../../../db";
import { getVapiConfig, toVapiAssistant, vapiFetch } from "../../../vapi";

export const runtime = "edge";

/**
 * The webhook URL Vapi will call during phone calls. It must be reachable from
 * the public internet, so prefer an explicit PUBLIC_APP_URL (your deployed
 * domain or tunnel URL) over the request origin, which is localhost in dev.
 */
async function resolveWebhookUrl(request: Request) {
  const env = (await getRuntimeEnv()) as unknown as Record<string, string | undefined>;
  const configured = (env.PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  const base = configured || new URL(request.url).origin;
  const url = new URL("/api/vapi/webhook", base);
  const unreachable =
    url.protocol !== "https:" ||
    /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|\[::1\])/.test(url.hostname);
  return { url: url.toString(), unreachable };
}

type Payload = { agentId?: string; phoneNumberId?: string };

/**
 * Publishes an AgentX blueprint to Vapi as a live assistant, so it can answer
 * real phone calls. Creates on first publish, updates thereafter.
 */
export async function POST(request: Request) {
  const user = await getAgentXUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  const config = await getVapiConfig();
  if (!config) return Response.json({ error: "Voice platform is not connected." }, { status: 503 });
  if (!config.webhookSecret) {
    return Response.json(
      { error: "Set VAPI_WEBHOOK_SECRET before publishing, or tool calls cannot be trusted." },
      { status: 503 },
    );
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const agentId = payload.agentId?.trim().slice(0, 80) || "";
  if (!agentId) return Response.json({ error: "An agent is required." }, { status: 400 });

  const ownerEmail = user.email.toLowerCase();
  const db = await getDb();
  const rows = await db
    .select()
    .from(createdAgents)
    .where(and(eq(createdAgents.id, agentId), eq(createdAgents.ownerEmail, ownerEmail)))
    .limit(1);
  const agent = rows[0];
  if (!agent) return Response.json({ error: "Agent not found." }, { status: 404 });

  const webhook = await resolveWebhookUrl(request);
  if (webhook.unreachable) {
    // Publishing anyway would "succeed" while every tool call during a phone
    // call silently failed to reach this app, so leads would never be saved.
    return Response.json(
      {
        error:
          "Phone calls need a public HTTPS address for this app. Run `npm run vapi:tunnel` and set PUBLIC_APP_URL to the https URL it prints, or deploy first.",
        code: "webhook_unreachable",
      },
      { status: 409 },
    );
  }
  const definition = toVapiAssistant(agent, webhook.url, config.webhookSecret);

  const result = agent.vapiAssistantId
    ? await vapiFetch<{ id?: string }>(config, `/assistant/${agent.vapiAssistantId}`, {
        method: "PATCH",
        body: definition,
      })
    : await vapiFetch<{ id?: string }>(config, "/assistant", { method: "POST", body: definition });

  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  const assistantId = result.data?.id || agent.vapiAssistantId;
  if (!assistantId) {
    return Response.json({ error: "The voice platform did not return an assistant." }, { status: 502 });
  }

  // Attach a phone number so the assistant answers inbound calls.
  if (payload.phoneNumberId) {
    await vapiFetch(config, `/phone-number/${payload.phoneNumberId}`, {
      method: "PATCH",
      body: { assistantId },
    });
  }

  await db
    .update(createdAgents)
    .set({
      vapiAssistantId: assistantId,
      status: "published",
      ...(payload.phoneNumberId ? { vapiPhoneNumber: payload.phoneNumberId } : {}),
    })
    .where(eq(createdAgents.id, agentId));

  return Response.json({ ok: true, assistantId, status: "published" });
}
