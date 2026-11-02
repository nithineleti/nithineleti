import { eq, lt, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { requestLimits } from "../../db/schema";

type LimitOptions = {
  scope: string;
  maxRequests: number;
  windowMs: number;
};

function clientFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("cf-connecting-ip") || forwarded || "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 180) || "unknown";
  return `${address}|${userAgent}`;
}

async function fingerprintKey(scope: string, request: Request) {
  const encoded = new TextEncoder().encode(`${scope}|${clientFingerprint(request)}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${scope}:${hash}`;
}

/**
 * Limits by a hashed IP/user-agent fingerprint. Counters are shared through D1,
 * making the check work across Worker isolates without retaining raw addresses.
 */
export async function enforceRequestLimit(request: Request, options: LimitOptions) {
  try {
    const now = Date.now();
    const windowStartedAt = Math.floor(now / options.windowMs) * options.windowMs;
    const key = await fingerprintKey(options.scope, request);
    const db = await getDb();

    await db
      .insert(requestLimits)
      .values({ key, windowStartedAt, requestCount: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: requestLimits.key,
        set: {
          windowStartedAt: sql`case when ${requestLimits.windowStartedAt} < ${windowStartedAt} then ${windowStartedAt} else ${requestLimits.windowStartedAt} end`,
          requestCount: sql`case when ${requestLimits.windowStartedAt} < ${windowStartedAt} then 1 else ${requestLimits.requestCount} + 1 end`,
          updatedAt: now,
        },
      });

    const [counter] = await db
      .select({ count: requestLimits.requestCount })
      .from(requestLimits)
      .where(eq(requestLimits.key, key))
      .limit(1);

    // A successful new window is a low-cost opportunity to discard stale hashes.
    if (counter?.count === 1) {
      await db
        .delete(requestLimits)
        .where(lt(requestLimits.updatedAt, now - Math.max(options.windowMs * 2, 60 * 60 * 1000)));
    }

    if ((counter?.count || 0) <= options.maxRequests) return null;
    const retryAfter = Math.max(1, Math.ceil((windowStartedAt + options.windowMs - now) / 1000));
    return Response.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  } catch {
    // Expensive routes must fail closed if their shared protection is unavailable.
    return Response.json(
      { error: "This service is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }
}
