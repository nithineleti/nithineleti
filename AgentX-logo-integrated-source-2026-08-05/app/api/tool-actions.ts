import { getDb } from "../../db";
import { appointmentRequests, handoffRequests, leads } from "../../db/schema";

/**
 * The three business actions an agent can take, shared by every channel.
 *
 * The browser agent and the Vapi phone agent both call these, so a lead
 * captured over the phone obeys exactly the same consent and tenancy rules as
 * one captured on the website.
 */
export const text = (value: unknown, max = 500) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function required(value: unknown, field: string) {
  const result = text(value);
  if (!result) throw new Error(`${field} is required`);
  return result;
}

export type ToolResult = { ok: boolean; error?: string } & Record<string, unknown>;

export async function runToolAction(
  tool: string,
  args: Record<string, unknown>,
  context: { conversationId: string; ownerEmail: string },
): Promise<ToolResult> {
  const db = await getDb();
  const { conversationId, ownerEmail } = context;

  if (tool === "create_lead") {
    // Consent is a hard gate, on every channel.
    if (args.consentConfirmed !== true) {
      return { ok: false, error: "Consent must be confirmed before saving a lead." };
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
    return { ok: true, leadId: id, status: "saved", message: "The enquiry was saved for team follow-up." };
  }

  if (tool === "request_appointment") {
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
    return {
      ok: true,
      requestId: id,
      status: "requested",
      message: "The appointment request was saved. A team member still needs to confirm availability.",
    };
  }

  if (tool === "request_human_handoff") {
    const id = crypto.randomUUID();
    await db.insert(handoffRequests).values({
      ownerEmail,
      id,
      conversationId,
      name: text(args.name, 160),
      contact: required(args.contact, "contact"),
      reason: required(args.reason, "reason"),
      urgency: ["low", "normal", "high"].includes(text(args.urgency)) ? text(args.urgency) : "normal",
    });
    return { ok: true, handoffId: id, status: "queued", message: "A human follow-up request was queued for the team." };
  }

  return { ok: false, error: "Unknown tool." };
}
