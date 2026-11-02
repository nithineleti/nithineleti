// TEMPORARY visual-QA route for the live-operations package. Delete after QA.
// Renders the dashboard with clearly-labelled example records; nothing here is real.
import LiveOperations, { type OperationsInitial } from "../admin/live-operations";

export const dynamic = "force-dynamic";

const ago = (now: number, minutes: number) =>
  new Date(now - minutes * 60_000).toISOString().slice(0, 19).replace("T", " ");

function buildExample(now: number): OperationsInitial {
  return {
    serverTime: new Date(now).toISOString(),
    error: "",
    ownerEmail: "example-owner@creatorstouch.example",
    leads: [
      { id: "l1", name: "Ravi Teja Kondapalli", company: "Sri Lakshmi Silks", email: "ravi@example.in", phone: "+91 98480 12345", location: "Vijayawada", service: "Website redesign", timeline: "Before Dasara", preferredContact: "phone", source: "voice-agent", status: "new", createdAt: ago(now, 4) },
      { id: "l2", name: "Anusha Reddy", company: "Bloom Dental Clinic", email: "anusha@example.in", phone: "", location: "Guntur", service: "Google Business profile setup", timeline: "This month", preferredContact: "email", source: "phone", status: "new", createdAt: ago(now, 38) },
      { id: "l3", name: "Mohammed Irfan", company: "", email: "", phone: "+91 90000 45678", location: "Benz Circle", service: "Instagram ad campaign", timeline: "", preferredContact: "whatsapp", source: "voice-agent", status: "contacted", createdAt: ago(now, 190) },
      { id: "l4", name: "Lakshmi Prasanna", company: "Annapurna Sweets", email: "orders@example.in", phone: "+91 99490 33221", location: "Eluru", service: "Product photography", timeline: "Next 2 weeks", preferredContact: "phone", source: "phone", status: "qualified", createdAt: ago(now, 26 * 60) },
      { id: "l5", name: "Karthik Varma", company: "KV Fitness Studio", email: "karthik@example.in", phone: "", location: "Vijayawada", service: "Brand identity", timeline: "Flexible", preferredContact: "email", source: "voice-agent", status: "new", createdAt: ago(now, 3 * 24 * 60) },
    ],
    appointments: [
      { id: "a1", name: "Ravi Teja Kondapalli", contact: "+91 98480 12345", requestedDate: "2026-10-07", requestedTime: "11:30 am", timezone: "Asia/Kolkata", service: "Website redesign consultation", notes: "Wants to see examples of saree e-commerce sites. Prefers Telugu.", status: "requested", createdAt: ago(now, 3) },
      { id: "a2", name: "Anusha Reddy", contact: "anusha@example.in", requestedDate: "2026-10-09", requestedTime: "4:00 pm", timezone: "Asia/Kolkata", service: "Google profile review", notes: "", status: "confirmed", createdAt: ago(now, 37) },
      { id: "a3", name: "Suresh Babu", contact: "+91 94401 77889", requestedDate: "Next Monday", requestedTime: "Morning", timezone: "Asia/Kolkata", service: "Logo refresh", notes: "Owns a hardware store near Governorpet.", status: "requested", createdAt: ago(now, 300) },
    ],
    handoffs: [
      { id: "h1", name: "Padma Sri", contact: "+91 93913 55410", reason: "Wants to discuss a refund for an unfinished print order", urgency: "high", status: "queued", createdAt: ago(now, 12) },
      { id: "h2", name: "", contact: "venkat@example.in", reason: "Asked for custom pricing on a yearly retainer", urgency: "normal", status: "queued", createdAt: ago(now, 95) },
      { id: "h3", name: "Harika", contact: "+91 98660 21010", reason: "Prefers to speak with the designer directly", urgency: "low", status: "resolved", createdAt: ago(now, 30 * 60) },
    ],
  };
}

export default function QaLiveOperations() {
  const initial = buildExample(new Date().getTime());
  return (
    <>
      <p
        style={{
          margin: 0,
          padding: "8px 16px",
          background: "rgba(231,155,109,.12)",
          color: "var(--accent-warm)",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        QA preview — example records only, not real customer data.
      </p>
      <LiveOperations initial={initial} />
    </>
  );
}
