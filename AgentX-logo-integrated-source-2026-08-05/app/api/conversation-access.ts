import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { conversations } from "../../db/schema";

/**
 * Resolves the tenant that owns a conversation.
 *
 * The conversation id is a server-generated UUIDv4 handed only to the caller who
 * successfully authenticated at /api/session, so possessing it authorises
 * writing to that conversation and nothing else. Ownership is read from the
 * stored row rather than from the caller, so a caller can never attribute
 * records to a tenant that is not theirs.
 */
export async function resolveConversationOwner(
  conversationId: string,
): Promise<{ ownerEmail: string } | null> {
  if (!conversationId) return null;
  const db = await getDb();
  const rows = await db
    .select({ ownerEmail: conversations.ownerEmail })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return rows[0] ?? null;
}
