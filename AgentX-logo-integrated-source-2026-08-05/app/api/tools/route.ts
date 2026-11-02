import { getDb } from "../../../db";
import {
  appointmentRequests,
  conversationEvents,
  createdAgents,
  handoffRequests,
  leads,
} from "../../../db/schema";
import { resolveConversationOwner } from "../conversation-access";

type ToolPayload = {
  conversationId?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
};

const text = (value: unknown, max = 500) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function required(value: unknown, field: string) {
  const result = text(value);
  if (!result) throw new Error(`${field} is required`);
  return result;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ToolPayload;
    const conversationId = required(payload.conversationId, "conversationId");

    // Possession of the server-issued conversation id is the authorisation, and
    // the conversation decides which tenant these records belong to.
    const owner = await resolveConversationOwner(conversationId);
    if (!owner) {
      return Response.json({ ok: false, error: "Unknown conversation." }, { status: 401 });
    }
    const ownerEmail = owner.ownerEmail;

    const args = payload.arguments || {};
    const db = await getDb();
    let result: Record<string, unknown>;

    if (payload.tool === "create_lead") {
      if (args.consentConfirmed !== true) {
        return Response.json(
          { ok: false, error: "Consent must be confirmed before saving a lead." },
          { status: 400 },
        );
      }

      const id = crypto.randomUUID();
      await db.insert(leads).values({
        ownerEmail,
        id,
        conversationId,
        name: required(args.name, "name"),
        company: text(args.company),
        email: text(args.email, 254),
        phone: text(args.phone, 50),
        location: text(args.location, 160),
        service: required(args.service, "service"),
        timeline: text(args.timeline, 120),
        preferredContact: text(args.preferredContact, 50),
      });
      result = {
        ok: true,
        leadId: id,
        status: "saved",
        message: "The enquiry was saved for team follow-up.",
      };
    } else if (payload.tool === "request_appointment") {
      const id = crypto.randomUUID();
      await db.insert(appointmentRequests).values({
        ownerEmail,
        id,
        conversationId,
        leadId: text(args.leadId) || null,
        name: required(args.name, "name"),
        contact: required(args.contact, "contact"),
        requestedDate: required(args.requestedDate, "requestedDate"),
        requestedTime: text(args.requestedTime, 50),
        timezone: required(args.timezone, "timezone"),
        service: text(args.service, 160),
        notes: text(args.notes, 800),
      });
      result = {
        ok: true,
        requestId: id,
        status: "requested",
        message:
          "The appointment request was saved. A team member still needs to confirm availability.",
      };
    } else if (payload.tool === "request_human_handoff") {
      const id = crypto.randomUUID();
      await db.insert(handoffRequests).values({
        ownerEmail,
        id,
        conversationId,
        name: text(args.name, 160),
        contact: required(args.contact, "contact"),
        reason: required(args.reason, "reason"),
        urgency: ["low", "normal", "high"].includes(text(args.urgency))
          ? text(args.urgency)
          : "normal",
      });
      result = {
        ok: true,
        handoffId: id,
        status: "queued",
        message: "A human follow-up request was queued for the team.",
      };
    } else if (payload.tool === "create_voice_agent") {
      if (args.approvedByClient !== true) {
        return Response.json(
          { ok: false, error: "The client must approve the requirements summary first." },
          { status: 400 },
        );
      }
      const id = crypto.randomUUID();
      const list = (value: unknown) =>
        Array.isArray(value)
          ? value.map((item) => text(item, 120)).filter(Boolean).slice(0, 20).join(", ")
          : text(value, 1000);
      await db.insert(createdAgents).values({
        id,
        name: required(args.name, "name"),
        clientName: text(args.clientName, 160),
        businessName: required(args.businessName, "businessName"),
        industry: text(args.industry, 160),
        agentType: required(args.agentType, "agentType"),
        primaryGoal: required(args.primaryGoal, "primaryGoal"),
        languages: list(args.languages) || "English",
        voice: text(args.voice, 40) || "marin",
        tone: text(args.tone, 160) || "professional",
        channels: list(args.channels) || "web",
        capabilities: list(args.capabilities),
        integrations: list(args.integrations),
        welcomeMessage: required(args.welcomeMessage, "welcomeMessage"),
        instructions: required(args.instructions, "instructions"),
        source: "voice",
      });
      result = {
        ok: true,
        agentId: id,
        status: "draft_created",
        message:
          "The agent draft was created. Direct the client to AgentX Studio to securely issue one-time credentials without reading secrets aloud.",
      };
    } else {
      return Response.json({ ok: false, error: "Unknown tool." }, { status: 400 });
    }

    await db.insert(conversationEvents).values({
      id: crypto.randomUUID(),
      conversationId,
      role: "tool",
      eventType: payload.tool,
      content: JSON.stringify(result),
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool request failed";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
