import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getDb } from "../../db";
import { requireAgentXUser } from "../auth";
import { appointmentRequests, handoffRequests, leads } from "../../db/schema";
import LiveOperations, { type OperationsInitial } from "./live-operations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Operations",
  robots: { index: false, follow: false },
};

type LeadRecord = typeof leads.$inferSelect;
type AppointmentRecord = typeof appointmentRequests.$inferSelect;
type HandoffRecord = typeof handoffRequests.$inferSelect;

// Only the fields the dashboard renders cross into the client bundle's props.
const toLead = (row: LeadRecord) => ({
  id: row.id,
  name: row.name,
  company: row.company,
  email: row.email,
  phone: row.phone,
  location: row.location,
  service: row.service,
  timeline: row.timeline,
  preferredContact: row.preferredContact,
  source: row.source,
  status: row.status,
  createdAt: row.createdAt,
});

const toAppointment = (row: AppointmentRecord) => ({
  id: row.id,
  name: row.name,
  contact: row.contact,
  requestedDate: row.requestedDate,
  requestedTime: row.requestedTime,
  timezone: row.timezone,
  service: row.service,
  notes: row.notes,
  status: row.status,
  createdAt: row.createdAt,
});

const toHandoff = (row: HandoffRecord) => ({
  id: row.id,
  name: row.name,
  contact: row.contact,
  reason: row.reason,
  urgency: row.urgency,
  status: row.status,
  createdAt: row.createdAt,
});

export default async function AdminPage() {
  // Operations data is customer PII. Never render it to an anonymous visitor.
  const user = await requireAgentXUser("/admin");
  // Scope every query to the signed-in tenant. Without this, one customer sees
  // every other customer's leads, contacts and appointment details.
  const ownerEmail = user.email.toLowerCase();

  const initial: OperationsInitial = {
    leads: [],
    appointments: [],
    handoffs: [],
    serverTime: new Date().toISOString(),
    error: "",
    ownerEmail,
  };

  try {
    const db = await getDb();
    const [leadRows, appointmentRows, handoffRows] = await Promise.all([
      db
        .select()
        .from(leads)
        .where(eq(leads.ownerEmail, ownerEmail))
        .orderBy(desc(leads.createdAt))
        .limit(50),
      db
        .select()
        .from(appointmentRequests)
        .where(eq(appointmentRequests.ownerEmail, ownerEmail))
        .orderBy(desc(appointmentRequests.createdAt))
        .limit(50),
      db
        .select()
        .from(handoffRequests)
        .where(eq(handoffRequests.ownerEmail, ownerEmail))
        .orderBy(desc(handoffRequests.createdAt))
        .limit(50),
    ]);
    initial.leads = leadRows.map(toLead);
    initial.appointments = appointmentRows.map(toAppointment);
    initial.handoffs = handoffRows.map(toHandoff);
  } catch {
    initial.error = "Operations data could not be loaded. Check the database binding and that migrations have been applied.";
  }

  // Summary counts and phone minutes arrive from /api/operations on the first
  // client sync, which runs immediately after hydration.
  return <LiveOperations initial={initial} />;
}
