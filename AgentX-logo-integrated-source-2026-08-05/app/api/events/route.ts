import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { conversationEvents, conversations } from "../../../db/schema";
import { resolveConversationOwner } from "../conversation-access";

type EventPayload = {
  conversationId?: string;
  role?: string;
  eventType?: string;
  content?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as EventPayload;
    const conversationId = payload.conversationId?.trim().slice(0, 80);
    const role = payload.role?.trim().slice(0, 20);
    const eventType = payload.eventType?.trim().slice(0, 80);

    if (!conversationId || !role || !eventType) {
      return Response.json({ error: "Invalid event." }, { status: 400 });
    }

    // Possession of the server-issued conversation id is the authorisation.
    const owner = await resolveConversationOwner(conversationId);
    if (!owner) {
      return Response.json({ error: "Unknown conversation." }, { status: 401 });
    }

    const db = await getDb();
    await db.insert(conversationEvents).values({
      id: crypto.randomUUID(),
      conversationId,
      role,
      eventType,
      content: payload.content?.trim().slice(0, 4000) || "",
      ownerEmail: owner.ownerEmail,
    });

    if (eventType === "conversation.ended") {
      await db
        .update(conversations)
        .set({ status: "ended", endedAt: new Date().toISOString() })
        .where(eq(conversations.id, conversationId));
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not save event." }, { status: 400 });
  }
}
