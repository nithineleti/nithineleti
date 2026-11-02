"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import BrandLogo from "../brand-logo";
import s from "./platform.module.css";

/**
 * Every status on this page was checked against the source code, not the
 * roadmap. When a capability ships, change its status here in the same change.
 *   live    — built and working end to end once provider credentials are set
 *   partial — some of it works; the gap is spelled out
 *   planned — not built yet
 */
type Status = "live" | "partial" | "planned";

type Feature = { name: string; status: Status; source?: string; note?: string };
type Stage = { id: string; title: string; text: string; features: Feature[] };

const stages: Stage[] = [
  {
    id: "01",
    title: "Accounts & sign-in",
    text: "Supabase-backed accounts with a server-side, HTTP-only session.",
    features: [
      { name: "Email & password sign-in", status: "live", source: "app/api/auth/password" },
      { name: "Google sign-in", status: "partial", source: "app/api/auth/authorize", note: "Built; switched off in the identity provider" },
      { name: "Mobile OTP sign-in", status: "partial", source: "app/api/auth/otp", note: "Built; switched off in the identity provider" },
      { name: "Team roles", status: "planned" },
      { name: "Audit trail", status: "planned" },
    ],
  },
  {
    id: "02",
    title: "Plans & usage",
    text: "INR plans, Stripe checkout and per-call minute metering.",
    features: [
      { name: "Call-minute metering", status: "live", source: "app/api/vapi/webhook", note: "Recorded per call, rounded up to the minute" },
      { name: "Stripe checkout", status: "partial", source: "app/api/billing/checkout", note: "Opens once Stripe keys and INR price IDs are added" },
      { name: "Subscription webhook & records", status: "planned" },
      { name: "Plan limit enforcement", status: "planned" },
      { name: "Billing history", status: "planned" },
    ],
  },
  {
    id: "03",
    title: "Agent workspace",
    text: "Create client-owned agents and hand over private credentials.",
    features: [
      { name: "Agent builder", status: "live", source: "app/studio" },
      { name: "One-time access credentials", status: "live", source: "app/api/agent-access", note: "Keys are stored hashed" },
      { name: "Version history & restore", status: "planned" },
      { name: "Clone an agent", status: "planned" },
    ],
  },
  {
    id: "04",
    title: "Knowledge studio",
    text: "Ground answers in a business's own website, FAQs and documents.",
    features: [
      { name: "Website import", status: "planned" },
      { name: "Document sources", status: "planned" },
      { name: "Knowledge-gap report", status: "planned" },
    ],
  },
  {
    id: "05",
    title: "Website voice",
    text: "Talk to an agent from the browser over a realtime voice session.",
    features: [
      { name: "Browser voice session", status: "live", source: "app/api/session" },
      { name: "Floating site widget", status: "planned" },
      { name: "Embed snippet & token rotation", status: "planned" },
    ],
  },
  {
    id: "06",
    title: "Inbound calling",
    text: "A published agent answers a real phone number through Vapi.",
    features: [
      { name: "Attach a phone number", status: "live", source: "app/api/vapi/publish" },
      { name: "Call transcripts saved", status: "live", source: "app/api/vapi/webhook" },
      { name: "Working hours", status: "planned" },
      { name: "Live transfer to a person", status: "planned" },
    ],
  },
  {
    id: "07",
    title: "Outbound calling",
    text: "Place a call from one of your own agents to a customer's number.",
    features: [
      { name: "Single outbound call", status: "live", source: "app/api/vapi/call" },
      { name: "Campaign lists", status: "planned" },
      { name: "Voicemail detection", status: "planned" },
      { name: "Do-not-call controls", status: "planned" },
    ],
  },
  {
    id: "08",
    title: "Business actions",
    text: "Agents save what callers ask for, so the team can follow up.",
    features: [
      { name: "Lead capture", status: "live", source: "app/api/tool-actions.ts" },
      { name: "Appointment requests", status: "live", source: "app/api/tool-actions.ts", note: "Saved for the team to confirm" },
      { name: "Human handoff queue", status: "live", source: "app/api/tool-actions.ts" },
      { name: "Calendar, CRM & WhatsApp connectors", status: "planned" },
    ],
  },
  {
    id: "09",
    title: "Operations & insight",
    text: "See what came out of conversations, scoped to your account.",
    features: [
      { name: "Leads, bookings & handoffs view", status: "live", source: "app/admin" },
      { name: "Call summaries", status: "planned" },
      { name: "Sentiment & lead scoring", status: "planned" },
    ],
  },
  {
    id: "10",
    title: "Scale & white-label",
    text: "Templates, sub-accounts and branded delivery for agencies.",
    features: [
      { name: "Template marketplace", status: "planned" },
      { name: "Client sub-accounts", status: "planned" },
      { name: "Custom domains & white-label", status: "planned" },
    ],
  },
];

const remaining = [
  ["Billing", "Add a Stripe webhook and a subscriptions table, so a payment actually changes what an account can do."],
  ["Limits", "Enforce plan allowances: agent counts and the call minutes already being metered."],
  ["Sign-in", "Switch on Google and mobile OTP in the Supabase project. The login page shows them automatically."],
  ["Knowledge", "Build website and document import so answers are grounded in the business's own content."],
  ["Integrations", "Calendar, CRM and WhatsApp connectors. Today bookings are saved as requests for a person to confirm."],
] as const;

const statusMeta: Record<Status, { label: string; description: string }> = {
  live: { label: "Live", description: "Built and working once provider credentials are connected." },
  partial: { label: "Partial", description: "Some of it works. The gap is noted on the card." },
  planned: { label: "Planned", description: "Not built yet." },
};

const order: Status[] = ["live", "partial", "planned"];

function stageStatus(stage: Stage): Status {
  const all = stage.features.map((feature) => feature.status);
  if (all.every((status) => status === "live")) return "live";
  if (all.every((status) => status === "planned")) return "planned";
  return "partial";
}

type Filter = "all" | Status;

export default function PlatformPage() {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const features = { live: 0, partial: 0, planned: 0 };
    for (const stage of stages) {
      for (const feature of stage.features) features[feature.status] += 1;
    }
    const total = features.live + features.partial + features.planned;
    return { features, total };
  }, []);

  // Filtering is by capability: show areas that contain one, and dim the rest of each card.
  const visible = stages.filter(
    (stage) => filter === "all" || stage.features.some((feature) => feature.status === filter),
  );

  return (
    <main className={s.shell}>
      <nav className="nav studioNav">
        <BrandLogo />
        <div className={`navRight ${s.navLinks}`}>
          <Link href="/pricing">Pricing</Link>
          <Link href="/studio">Create agent</Link>
          <span className="navBadge">Build status</span>
        </div>
      </nav>

      <header className={s.hero}>
        <p className={s.eyebrow}><span className={s.eyebrowDot} aria-hidden="true" />Platform status</p>
        <h1>
          What AgentX does today.
          <br />
          <span>And what it doesn&apos;t, yet.</span>
        </h1>
        <p className={s.lede}>
          Each capability below is labelled against the source code, not the roadmap. Nothing here is a usage
          figure. These are the parts of the product and how far along each one is.
        </p>
        <div className={s.heroActions}>
          <Link className={s.primaryCta} href="/studio">
            Create an agent
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
          </Link>
          <Link className={s.secondaryCta} href="/pricing">View INR plans</Link>
        </div>
      </header>

      <section className={s.summary} aria-labelledby="summary-title">
        <div className={s.summaryHead}>
          <h2 id="summary-title">Capability breakdown</h2>
          <p>
            <strong className={s.num}>{counts.total}</strong> capabilities across{" "}
            <strong className={s.num}>{stages.length}</strong> areas
          </p>
        </div>
        <div
          className={s.bar}
          role="img"
          aria-label={`${counts.features.live} live, ${counts.features.partial} partial, ${counts.features.planned} planned`}
        >
          {order.map((status, index) => (
            <span
              key={status}
              className={s.barSegment}
              data-status={status}
              style={{ flexGrow: counts.features[status], "--i": index } as CSSProperties}
            />
          ))}
        </div>

        <div className={s.legend} role="group" aria-label="Filter capabilities by status">
          <button
            type="button"
            className={s.chip}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All <span className={s.num}>{counts.total}</span>
          </button>
          {order.map((status) => (
            <button
              key={status}
              type="button"
              className={s.chip}
              data-status={status}
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
            >
              <span className={s.dot} data-status={status} aria-hidden="true" />
              {statusMeta[status].label}
              <span className={s.num}>{counts.features[status]}</span>
            </button>
          ))}
        </div>
        <dl className={s.legendKey}>
          {order.map((status) => (
            <div key={status}>
              <dt><span className={s.dot} data-status={status} aria-hidden="true" />{statusMeta[status].label}</dt>
              <dd>
                {statusMeta[status].description}{" "}
                <span className={`${s.num} ${s.keyCount}`}>{counts.features[status]} capabilities</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p className={s.srOnly} aria-live="polite">
        {filter === "all"
          ? `Showing all ${visible.length} areas`
          : `Showing ${counts.features[filter]} ${statusMeta[filter].label.toLowerCase()} capabilities in ${visible.length} areas`}
      </p>

      <section className={s.grid} key={filter} aria-label="Platform areas">
        {visible.map((stage, index) => {
          const status = stageStatus(stage);
          const liveCount = stage.features.filter((feature) => feature.status === "live").length;
          return (
            <article className={s.card} key={stage.id} style={{ "--i": index } as CSSProperties}>
              <header className={s.cardHead}>
                <span className={s.cardNumber}>{stage.id}</span>
                <span className={s.badge} data-status={status}>
                  <span className={s.dot} data-status={status} aria-hidden="true" />
                  {statusMeta[status].label}
                </span>
              </header>
              <h3>{stage.title}</h3>
              <p className={s.cardText}>{stage.text}</p>
              <div className={s.progress} aria-hidden="true">
                {stage.features.map((feature) => (
                  <span key={feature.name} data-status={feature.status} />
                ))}
              </div>
              <p className={s.progressLabel}>
                <span className={s.num}>{liveCount}/{stage.features.length}</span> live
              </p>
              <ul className={s.features}>
                {stage.features.map((feature) => (
                  <li key={feature.name} data-dim={filter !== "all" && feature.status !== filter ? "true" : undefined}>
                    <span className={s.dot} data-status={feature.status} aria-hidden="true" />
                    <span className={s.featureBody}>
                      <span className={s.featureName}>{feature.name}</span>
                      {feature.note && <span className={s.featureNote}>{feature.note}</span>}
                      {feature.source && <code className={s.featureSource}>{feature.source}</code>}
                    </span>
                    <span className={s.featureStatus} data-status={feature.status}>
                      {statusMeta[feature.status].label}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <section className={s.remaining} aria-labelledby="remaining-title">
        <div>
          <p className={s.eyebrow}><span className={s.eyebrowDot} data-tone="warm" aria-hidden="true" />Before calling it complete</p>
          <h2 id="remaining-title">What is still left.</h2>
          <p>
            Calling, lead capture and email sign-in work today. These are the gaps between that and a
            self-serve paid product, in the order they matter.
          </p>
        </div>
        <ol>
          {remaining.map(([label, item], index) => (
            <li key={label}>
              <span className={s.remainingIndex}>{String(index + 1).padStart(2, "0")}</span>
              <span>
                <strong>{label}</strong>
                {item}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
