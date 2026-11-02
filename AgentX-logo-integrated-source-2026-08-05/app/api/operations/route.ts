import { and, count, desc, eq, gt, sql, sum } from "drizzle-orm";
import { getDb } from "../../../db";
import { appointmentRequests, handoffRequests, leads, usageEvents } from "../../../db/schema";
import { getAgentXUser } from "../../auth";
import { enforceRequestLimit } from "../request-limiter";

export const dynamic = "force-dynamic";

/** Rows per listing. Matches the server-rendered /admin page. */
const MAX_ROWS = 50;
/**
 * `created_at` has one-second resolution, so a row written in the same second
 * as the previous response would be missed by a strict `>` comparison. The
 * cursor we hand back trails serverTime by this overlap; the client
 * de-duplicates by id.
 */
const CURSOR_OVERLAP_MS = 10_000;
/** Operations are reported on the business day in India (the platform default timezone). */
const BUSINESS_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Every response carries no-store: this is per-tenant PII and must never be cached. */
function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: { "Cache-Control": "no-store", ...init.headers },
  });
}

/** D1 stores CURRENT_TIMESTAMP as `YYYY-MM-DD HH:MM:SS` (UTC). Compare in that format. */
function toSqliteTimestamp(ms: number) {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

type SinceResult = { ok: true; value: string | null } | { ok: false; error: string };

function parseSince(raw: string | null, now: number): SinceResult {
  if (raw === null || raw === "") return { ok: true, value: null };
  if (raw.length > 40 || !ISO_INSTANT.test(raw)) {
    return { ok: false, error: "`since` must be an ISO-8601 timestamp, e.g. 2026-10-04T09:30:00.000Z." };
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return { ok: false, error: "`since` is not a valid date." };
  // A cursor from the future is a client bug; reject it rather than return nothing forever.
  if (ms > now + 5 * 60 * 1000) return { ok: false, error: "`since` cannot be in the future." };
  return { ok: true, value: toSqliteTimestamp(ms) };
}

/** Midnight in Asia/Kolkata for the current business day, as a UTC epoch. */
function businessDayStart(now: number) {
  return Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function GET(request: Request) {
  const user = await getAgentXUser();
  if (!user) return json({ error: "Sign in required." }, { status: 401 });

  const limited = await enforceRequestLimit(request, {
    scope: "operations",
    maxRequests: 60,
    windowMs: 60 * 1000,
  });
  if (limited) {
    const retryAfter = limited.headers.get("retry-after");
    return json(await limited.json(), {
      status: limited.status,
      headers: retryAfter ? { "retry-after": retryAfter } : {},
    });
  }

  // Tenant identity comes from the verified session only, never from the query string.
  const ownerEmail = user.email.toLowerCase();
  const now = Date.now();
  const since = parseSince(new URL(request.url).searchParams.get("since"), now);
  if (!since.ok) return json({ error: since.error }, { status: 400 });

  const todayStartMs = businessDayStart(now);
  const todayStart = toSqliteTimestamp(todayStartMs);
  const sinceValue = since.value;

  try {
    const db = await getDb();
    const [
      leadRows,
      appointmentRows,
      handoffRows,
      [leadCounts],
      [appointmentCounts],
      [handoffCounts],
      [minutes],
    ] = await Promise.all([
      db
        .select({
          id: leads.id,
          name: leads.name,
          company: leads.company,
          email: leads.email,
          phone: leads.phone,
          location: leads.location,
          service: leads.service,
          timeline: leads.timeline,
          preferredContact: leads.preferredContact,
          source: leads.source,
          status: leads.status,
          createdAt: leads.createdAt,
        })
        .from(leads)
        .where(
          sinceValue
            ? and(eq(leads.ownerEmail, ownerEmail), gt(leads.createdAt, sinceValue))
            : eq(leads.ownerEmail, ownerEmail),
        )
        .orderBy(desc(leads.createdAt))
        .limit(MAX_ROWS),
      db
        .select({
          id: appointmentRequests.id,
          name: appointmentRequests.name,
          contact: appointmentRequests.contact,
          requestedDate: appointmentRequests.requestedDate,
          requestedTime: appointmentRequests.requestedTime,
          timezone: appointmentRequests.timezone,
          service: appointmentRequests.service,
          notes: appointmentRequests.notes,
          status: appointmentRequests.status,
          createdAt: appointmentRequests.createdAt,
        })
        .from(appointmentRequests)
        .where(
          sinceValue
            ? and(eq(appointmentRequests.ownerEmail, ownerEmail), gt(appointmentRequests.createdAt, sinceValue))
            : eq(appointmentRequests.ownerEmail, ownerEmail),
        )
        .orderBy(desc(appointmentRequests.createdAt))
        .limit(MAX_ROWS),
      db
        .select({
          id: handoffRequests.id,
          name: handoffRequests.name,
          contact: handoffRequests.contact,
          reason: handoffRequests.reason,
          urgency: handoffRequests.urgency,
          status: handoffRequests.status,
          createdAt: handoffRequests.createdAt,
        })
        .from(handoffRequests)
        .where(
          sinceValue
            ? and(eq(handoffRequests.ownerEmail, ownerEmail), gt(handoffRequests.createdAt, sinceValue))
            : eq(handoffRequests.ownerEmail, ownerEmail),
        )
        .orderBy(desc(handoffRequests.createdAt))
        .limit(MAX_ROWS),
      db
        .select({
          total: count(),
          today: sql<number>`coalesce(sum(case when ${leads.createdAt} >= ${todayStart} then 1 else 0 end), 0)`,
        })
        .from(leads)
        .where(eq(leads.ownerEmail, ownerEmail)),
      db
        .select({
          total: count(),
          today: sql<number>`coalesce(sum(case when ${appointmentRequests.createdAt} >= ${todayStart} then 1 else 0 end), 0)`,
          pending: sql<number>`coalesce(sum(case when ${appointmentRequests.status} = 'requested' then 1 else 0 end), 0)`,
        })
        .from(appointmentRequests)
        .where(eq(appointmentRequests.ownerEmail, ownerEmail)),
      db
        .select({
          total: count(),
          today: sql<number>`coalesce(sum(case when ${handoffRequests.createdAt} >= ${todayStart} then 1 else 0 end), 0)`,
          open: sql<number>`coalesce(sum(case when ${handoffRequests.status} = 'queued' then 1 else 0 end), 0)`,
        })
        .from(handoffRequests)
        .where(eq(handoffRequests.ownerEmail, ownerEmail)),
      db
        .select({
          total: sum(usageEvents.quantity),
          today: sql<number>`coalesce(sum(case when ${usageEvents.createdAt} >= ${todayStart} then ${usageEvents.quantity} else 0 end), 0)`,
        })
        .from(usageEvents)
        .where(and(eq(usageEvents.ownerEmail, ownerEmail), eq(usageEvents.eventType, "phone.call.minutes"))),
    ]);

    return json({
      serverTime: new Date(now).toISOString(),
      cursor: new Date(now - CURSOR_OVERLAP_MS).toISOString(),
      full: sinceValue === null,
      timezone: BUSINESS_TIMEZONE,
      todayStartsAt: new Date(todayStartMs).toISOString(),
      leads: leadRows,
      appointments: appointmentRows,
      handoffs: handoffRows,
      summary: {
        leads: { total: toNumber(leadCounts?.total), today: toNumber(leadCounts?.today) },
        appointments: {
          total: toNumber(appointmentCounts?.total),
          today: toNumber(appointmentCounts?.today),
          pending: toNumber(appointmentCounts?.pending),
        },
        handoffs: {
          total: toNumber(handoffCounts?.total),
          today: toNumber(handoffCounts?.today),
          open: toNumber(handoffCounts?.open),
        },
        phoneMinutes: { total: toNumber(minutes?.total), today: toNumber(minutes?.today) },
      },
    });
  } catch {
    return json(
      { error: "Operations data could not be loaded. Check the database binding and that migrations have been applied." },
      { status: 503 },
    );
  }
}
