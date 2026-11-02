"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import BrandLogo from "../brand-logo";
import styles from "./operations.module.css";

/* ------------------------------------------------------------------ types */

export type LeadRow = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  service: string;
  timeline: string;
  preferredContact: string;
  source: string;
  status: string;
  createdAt: string;
};

export type AppointmentRow = {
  id: string;
  name: string;
  contact: string;
  requestedDate: string;
  requestedTime: string;
  timezone: string;
  service: string;
  notes: string;
  status: string;
  createdAt: string;
};

export type HandoffRow = {
  id: string;
  name: string;
  contact: string;
  reason: string;
  urgency: string;
  status: string;
  createdAt: string;
};

export type OperationsSummary = {
  leads: { total: number; today: number };
  appointments: { total: number; today: number; pending: number };
  handoffs: { total: number; today: number; open: number };
  phoneMinutes: { total: number; today: number };
};

export type OperationsInitial = {
  leads: LeadRow[];
  appointments: AppointmentRow[];
  handoffs: HandoffRow[];
  /** ISO time the server rendered this snapshot. Seeds relative times so SSR and hydration agree. */
  serverTime: string;
  /** Server-side load error, shown as a notice. Empty when the load succeeded. */
  error: string;
  /** The signed-in account every record on this page belongs to. */
  ownerEmail: string;
};

type OperationsPayload = {
  serverTime: string;
  cursor: string;
  full: boolean;
  leads: LeadRow[];
  appointments: AppointmentRow[];
  handoffs: HandoffRow[];
  summary: OperationsSummary;
};

type TabKey = "leads" | "appointments" | "handoffs";
type Connection = "connecting" | "live" | "paused" | "reconnecting" | "signedOut";
type Tone = "accent" | "warm" | "neutral";
type Chip = { label: string; tone: Tone };
type ContactLink = { label: string; href: string; kind: "phone" | "email" | "text" };

type RowView = {
  id: string;
  kind: TabKey;
  createdAtMs: number;
  title: string;
  subtitle: string;
  primary: string;
  secondary: string;
  contacts: ContactLink[];
  chips: Chip[];
  details: [string, string][];
  search: string;
};

/* -------------------------------------------------------------- constants */

const POLL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
/** Every Nth poll is a full sync so status changes and removals also reach the page. */
const FULL_SYNC_EVERY = 12;
const MAX_ROWS = 50;
const FRESH_MS = 2_600;
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TABS: { key: TabKey; label: string; noun: [string, string] }[] = [
  { key: "leads", label: "Leads", noun: ["lead", "leads"] },
  { key: "appointments", label: "Appointments", noun: ["appointment request", "appointment requests"] },
  { key: "handoffs", label: "Handoffs", noun: ["handoff", "handoffs"] },
];

/* ---------------------------------------------------------------- helpers */

/** D1 writes `YYYY-MM-DD HH:MM:SS` in UTC; treat it as such. */
function parseTimestamp(value: string) {
  const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const ms = Date.parse(normalised);
  return Number.isFinite(ms) ? ms : 0;
}

function businessDayStart(now: number) {
  return Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

/** Deterministic IST formatting (no Intl) so server and client render identical strings. */
function formatIst(ms: number) {
  if (!ms) return "Unknown";
  const d = new Date(ms + IST_OFFSET_MS);
  const hours = d.getUTCHours();
  const h12 = hours % 12 || 12;
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${h12}:${minutes} ${hours < 12 ? "am" : "pm"} IST`;
}

function relativeTime(ms: number, now: number) {
  if (!ms) return "—";
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 2) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const d = new Date(ms + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function formatRequestedDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value || "Date to confirm";
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(d.getTime())) return value;
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "··";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function contactLink(value: string): ContactLink | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { label: trimmed, href: `mailto:${trimmed}`, kind: "email" };
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (/^\+?\d{7,15}$/.test(digits) && /^[\d\s()+-]+$/.test(trimmed)) {
    return { label: trimmed, href: `tel:${digits}`, kind: "phone" };
  }
  return { label: trimmed, href: "", kind: "text" };
}

const titleCase = (value: string) =>
  value ? value.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "";

function statusChip(status: string): Chip {
  const s = status.toLowerCase();
  if (s === "new") return { label: "New", tone: "accent" };
  if (s === "requested") return { label: "Awaiting confirmation", tone: "warm" };
  if (s === "queued") return { label: "Queued", tone: "warm" };
  if (["confirmed", "contacted", "qualified", "booked"].includes(s)) return { label: titleCase(s), tone: "accent" };
  return { label: titleCase(s) || "Open", tone: "neutral" };
}

const SOURCE_LABELS: Record<string, string> = {
  "voice-agent": "Website voice agent",
  phone: "Phone call",
  vapi: "Phone call",
};

function leadView(row: LeadRow): RowView {
  const contacts = [contactLink(row.phone), contactLink(row.email)].filter((c): c is ContactLink => Boolean(c));
  const source = SOURCE_LABELS[row.source] || titleCase(row.source) || "Voice agent";
  return {
    id: row.id,
    kind: "leads",
    createdAtMs: parseTimestamp(row.createdAt),
    title: row.name || "Caller",
    subtitle: [row.company, row.location].filter(Boolean).join(" · ") || "Individual enquiry",
    primary: row.service || "General enquiry",
    secondary: row.timeline ? `Timeline · ${row.timeline}` : source,
    contacts,
    chips: [statusChip(row.status)],
    details: [
      ["Company", row.company],
      ["Location", row.location],
      ["Phone", row.phone],
      ["Email", row.email],
      ["Prefers", titleCase(row.preferredContact)],
      ["Timeline", row.timeline],
      ["Source", source],
      ["Received", formatIst(parseTimestamp(row.createdAt))],
    ].filter((pair): pair is [string, string] => Boolean(pair[1])),
    search: [row.name, row.company, row.location, row.service, row.email, row.phone].join(" ").toLowerCase(),
  };
}

function appointmentView(row: AppointmentRow): RowView {
  const contact = contactLink(row.contact);
  const when = [formatRequestedDate(row.requestedDate), row.requestedTime].filter(Boolean).join(" · ");
  return {
    id: row.id,
    kind: "appointments",
    createdAtMs: parseTimestamp(row.createdAt),
    title: row.name || "Caller",
    subtitle: row.service || "Consultation",
    primary: when,
    secondary: row.timezone === "Asia/Kolkata" ? "IST" : row.timezone,
    contacts: contact ? [contact] : [],
    chips: [statusChip(row.status)],
    details: [
      ["Service", row.service],
      ["Requested", when],
      ["Timezone", row.timezone],
      ["Contact", row.contact],
      ["Notes", row.notes],
      ["Received", formatIst(parseTimestamp(row.createdAt))],
    ].filter((pair): pair is [string, string] => Boolean(pair[1])),
    search: [row.name, row.service, row.contact, row.notes, row.requestedDate].join(" ").toLowerCase(),
  };
}

function handoffView(row: HandoffRow): RowView {
  const contact = contactLink(row.contact);
  const urgency = row.urgency.toLowerCase();
  const chips: Chip[] = [];
  if (urgency === "high") chips.push({ label: "High urgency", tone: "warm" });
  chips.push(statusChip(row.status));
  return {
    id: row.id,
    kind: "handoffs",
    createdAtMs: parseTimestamp(row.createdAt),
    title: row.name || "Caller",
    subtitle: row.contact || "No contact left",
    primary: row.reason,
    // The reason is the actionable part; it gets both lines. High urgency is a chip.
    secondary: "",
    contacts: contact ? [contact] : [],
    chips,
    details: [
      ["Reason", row.reason],
      ["Urgency", titleCase(urgency)],
      ["Contact", row.contact],
      ["Received", formatIst(parseTimestamp(row.createdAt))],
    ].filter((pair): pair is [string, string] => Boolean(pair[1])),
    search: [row.name, row.contact, row.reason].join(" ").toLowerCase(),
  };
}

function mergeRows<T extends { id: string; createdAt: string }>(current: T[], incoming: T[], full: boolean) {
  const byId = new Map<string, T>();
  if (!full) for (const row of current) byId.set(row.id, row);
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()]
    .sort((a, b) => parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt))
    .slice(0, MAX_ROWS);
}

/** Before the first sync, counts come from the server-rendered rows; flag when the 50-row cap hides more. */
function deriveSummary(
  leads: LeadRow[],
  appointments: AppointmentRow[],
  handoffs: HandoffRow[],
  now: number,
): OperationsSummary {
  const start = businessDayStart(now);
  const today = (rows: { createdAt: string }[]) => rows.filter((r) => parseTimestamp(r.createdAt) >= start).length;
  return {
    leads: { total: leads.length, today: today(leads) },
    appointments: {
      total: appointments.length,
      today: today(appointments),
      pending: appointments.filter((r) => r.status === "requested").length,
    },
    handoffs: {
      total: handoffs.length,
      today: today(handoffs),
      open: handoffs.filter((r) => r.status === "queued").length,
    },
    phoneMinutes: { total: 0, today: 0 },
  };
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

/* ---------------------------------------------------------------- counter */

/**
 * Tweens from the previous value to the new one (450ms ease-out) by writing
 * textContent from a rAF loop: no React re-render per frame. The loop is
 * cancelled on unmount and skipped entirely when the tab is hidden or the
 * viewer prefers reduced motion.
 */
function Counter({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const format = (n: number) => n.toLocaleString("en-IN");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    const to = value;
    if (from === to) return;
    if (to > from) {
      el.classList.remove(styles.counterBump);
      void el.offsetWidth; // restart the highlight keyframe
      el.classList.add(styles.counterBump);
    }
    if (prefersReducedMotion() || document.visibilityState === "hidden") {
      shown.current = to;
      el.textContent = format(to);
      return;
    }
    el.textContent = format(from);
    let raf = 0;
    const start = performance.now();
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / 450);
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round(from + (to - from) * eased);
      shown.current = next;
      el.textContent = format(next);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      shown.current = to;
      el.textContent = format(to);
    };
  }, [value]);

  return (
    <span ref={ref} className={`${styles.counter} ${className || ""}`}>
      {format(value)}
    </span>
  );
}

/* -------------------------------------------------------------- component */

export default function LiveOperations({ initial }: { initial: OperationsInitial }) {
  const [leads, setLeads] = useState(initial.leads);
  const [appointments, setAppointments] = useState(initial.appointments);
  const [handoffs, setHandoffs] = useState(initial.handoffs);
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [fetching, setFetching] = useState(false);
  const [now, setNow] = useState(() => Date.parse(initial.serverTime) || 0);
  const [tab, setTab] = useState<TabKey>("leads");
  const [unseen, setUnseen] = useState<Record<TabKey, number>>({ leads: 0, appointments: 0, handoffs: 0 });
  const [fresh, setFresh] = useState<Record<string, true>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(initial.error);

  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cursorRef = useRef<string | null>(null);
  const failuresRef = useRef(0);
  const pollCountRef = useRef(0);
  const stoppedRef = useRef(false);
  const lastSuccessRef = useRef<number | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const retryAtRef = useRef<number | null>(null);
  const connectionRef = useRef<Connection>("connecting");
  const tabRef = useRef<TabKey>("leads");
  const knownIdsRef = useRef<Set<string>>(
    new Set([...initial.leads, ...initial.appointments, ...initial.handoffs].map((r) => r.id)),
  );
  const freshTimersRef = useRef<Set<number>>(new Set());
  const updatedRef = useRef<HTMLSpanElement>(null);
  const retryRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({ leads: null, appointments: null, handoffs: null });
  const pollRef = useRef<(full?: boolean) => void>(() => {});

  const updateConnection = useCallback((next: Connection) => {
    connectionRef.current = next;
    setConnection(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const abortInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setFetching(false);
  }, []);

  const schedule = useCallback(
    (delay: number) => {
      clearTimer();
      // A hidden tab never schedules; visibilitychange resumes polling.
      if (stoppedRef.current || document.visibilityState === "hidden") return;
      timerRef.current = window.setTimeout(() => pollRef.current(), delay);
    },
    [clearTimer],
  );

  const applyPayload = useCallback((payload: OperationsPayload) => {
    const full = payload.full;
    const arrivals: { kind: TabKey; name: string }[] = [];
    const freshIds: string[] = [];
    const scan = (rows: { id: string; name: string }[], kind: TabKey) => {
      for (const row of rows) {
        if (knownIdsRef.current.has(row.id)) continue;
        knownIdsRef.current.add(row.id);
        freshIds.push(row.id);
        arrivals.push({ kind, name: row.name || "A caller" });
      }
    };
    scan(payload.leads, "leads");
    scan(payload.appointments, "appointments");
    scan(payload.handoffs, "handoffs");

    setLeads((current) => mergeRows(current, payload.leads, full));
    setAppointments((current) => mergeRows(current, payload.appointments, full));
    setHandoffs((current) => mergeRows(current, payload.handoffs, full));
    setSummary(payload.summary);
    setNow(Date.parse(payload.serverTime) || Date.now());
    setLoadError("");

    if (!freshIds.length) return;
    setFresh((current) => {
      const next = { ...current };
      for (const id of freshIds) next[id] = true;
      return next;
    });
    const timer = window.setTimeout(() => {
      freshTimersRef.current.delete(timer);
      setFresh((current) => {
        const next = { ...current };
        for (const id of freshIds) delete next[id];
        return next;
      });
    }, FRESH_MS);
    freshTimersRef.current.add(timer);

    setUnseen((current) => {
      const next = { ...current };
      for (const arrival of arrivals) if (arrival.kind !== tabRef.current) next[arrival.kind] += 1;
      return next;
    });
    if (arrivals.length === 1) {
      const [{ kind, name }] = arrivals;
      const noun = TABS.find((t) => t.key === kind)!.noun[0];
      setAnnouncement(`New ${noun} from ${name}.`);
    } else {
      setAnnouncement(`${arrivals.length} new records arrived.`);
    }
  }, []);

  const poll = useCallback(
    async (forceFull = false) => {
      if (stoppedRef.current) return;
      clearTimer();
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const full = forceFull || !cursorRef.current || pollCountRef.current % FULL_SYNC_EVERY === 0;
      const url = full
        ? "/api/operations"
        : `/api/operations?since=${encodeURIComponent(cursorRef.current!)}`;
      setFetching(true);
      try {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        if (response.status === 401) {
          stoppedRef.current = true;
          clearTimer();
          updateConnection("signedOut");
          setAnnouncement("You have been signed out. Live updates stopped.");
          return;
        }
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("retry-after")) || 30;
          const delay = Math.min(MAX_BACKOFF_MS, retryAfter * 1000);
          retryAtRef.current = Date.now() + delay;
          updateConnection("reconnecting");
          schedule(delay);
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as OperationsPayload;
        if (controller.signal.aborted) return;
        applyPayload(payload);
        cursorRef.current = payload.cursor;
        failuresRef.current = 0;
        pollCountRef.current += 1;
        lastSuccessRef.current = Date.now();
        retryAtRef.current = null;
        if (connectionRef.current !== "live") {
          if (connectionRef.current === "reconnecting") setAnnouncement("Reconnected. Live updates resumed.");
          updateConnection("live");
        }
        schedule(POLL_MS);
      } catch {
        if (controller.signal.aborted) return;
        failuresRef.current += 1;
        // 5s, 10s, 20s, 40s, then capped at 60s, with ±15% jitter so tabs do not retry in lockstep.
        const base = Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** (failuresRef.current - 1));
        const delay = Math.round(base * (0.85 + Math.random() * 0.3));
        retryAtRef.current = Date.now() + delay;
        if (connectionRef.current !== "reconnecting") setAnnouncement("Connection lost. Reconnecting.");
        updateConnection("reconnecting");
        schedule(delay);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setFetching(false);
        }
      }
    },
    [applyPayload, clearTimer, schedule, updateConnection],
  );

  useEffect(() => {
    pollRef.current = (full?: boolean) => void poll(full);
  }, [poll]);

  // Polling lifecycle: first full sync on mount, pause while hidden, resume on return.
  useEffect(() => {
    const onVisibility = () => {
      if (stoppedRef.current) return;
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        clearTimer();
        abortInFlight();
        updateConnection("paused");
        return;
      }
      const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;
      // Long absences get a full sync so status changes made meanwhile are picked up.
      void poll(hiddenFor > 120_000);
    };
    const onOnline = () => {
      if (!stoppedRef.current && document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    const kickoff = window.setTimeout(() => {
      if (document.visibilityState === "visible") void poll(true);
      else updateConnection("paused");
    }, 0);
    const freshTimers = freshTimersRef.current;
    return () => {
      window.clearTimeout(kickoff);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      clearTimer();
      abortRef.current?.abort();
      for (const timer of freshTimers) window.clearTimeout(timer);
      freshTimers.clear();
    };
  }, [abortInFlight, clearTimer, poll, updateConnection]);

  // 1 Hz ticker for "Updated Ns ago" / retry countdown, written straight to the DOM.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      const el = updatedRef.current;
      if (el) {
        const last = lastSuccessRef.current;
        if (connectionRef.current === "signedOut") el.textContent = "Updates stopped";
        else if (!last) el.textContent = "Syncing…";
        else {
          const s = Math.max(0, Math.round((Date.now() - last) / 1000));
          el.textContent = s < 2 ? "Updated just now" : s < 60 ? `Updated ${s}s ago` : `Updated ${Math.floor(s / 60)}m ago`;
        }
      }
      const retry = retryRef.current;
      if (retry) {
        const at = retryAtRef.current;
        retry.textContent = at ? `retry in ${Math.max(0, Math.ceil((at - Date.now()) / 1000))}s` : "";
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    // Row timestamps ("3 min ago") only need a coarse refresh.
    const coarse = window.setInterval(() => {
      if (document.visibilityState === "visible") setNow(Date.now());
    }, 15_000);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(coarse);
    };
  }, [connection]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  /* ------------------------------------------------------------ derived */

  const stats = useMemo(
    () => summary ?? deriveSummary(leads, appointments, handoffs, now),
    [summary, leads, appointments, handoffs, now],
  );
  const capped = summary === null;

  const views = useMemo(
    () => ({
      leads: leads.map(leadView),
      appointments: appointments.map(appointmentView),
      handoffs: handoffs.map(handoffView),
    }),
    [leads, appointments, handoffs],
  );

  const activity = useMemo(
    () =>
      [...views.leads, ...views.appointments, ...views.handoffs]
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
        .slice(0, 8),
    [views],
  );

  const normalisedQuery = query.trim().toLowerCase();
  const visibleRows = useMemo(
    () => (normalisedQuery ? views[tab].filter((r) => r.search.includes(normalisedQuery)) : views[tab]),
    [views, tab, normalisedQuery],
  );

  const totals: Record<TabKey, number> = {
    leads: stats.leads.total,
    appointments: stats.appointments.total,
    handoffs: stats.handoffs.total,
  };

  /* ------------------------------------------------------------ actions */

  const selectTab = useCallback((key: TabKey, focus = false) => {
    tabRef.current = key;
    setTab(key);
    setUnseen((current) => (current[key] ? { ...current, [key]: 0 } : current));
    if (focus) tabRefs.current[key]?.focus();
  }, []);

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((t) => t.key === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    selectTab(TABS[next].key, true);
  };

  const toggleRow = (id: string) => setExpanded((current) => (current === id ? null : id));

  const onRowClick = (event: MouseEvent<HTMLLIElement>, id: string) => {
    // Links and buttons inside the row keep their own behaviour.
    if ((event.target as HTMLElement).closest("a,button,input")) return;
    if (window.getSelection()?.toString()) return;
    toggleRow(id);
  };

  const openFromActivity = (row: RowView) => {
    selectTab(row.kind);
    setQuery("");
    setExpanded(row.id);
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`op-row-${row.id}`);
      el?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      el?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus({ preventScroll: true });
    });
  };

  const copyContact = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setAnnouncement("Contact copied to clipboard.");
    } catch {
      setAnnouncement("Copy failed. Select the contact text instead.");
    }
  };

  const refresh = () => {
    if (stoppedRef.current || fetching) return;
    void poll(true);
  };

  /* ------------------------------------------------------------- render */

  const connectionLabel: Record<Connection, string> = {
    connecting: "Connecting",
    live: "Live",
    paused: "Paused",
    reconnecting: "Reconnecting",
    signedOut: "Signed out",
  };

  const activeTab = TABS.find((t) => t.key === tab)!;
  const tabIndex = TABS.findIndex((t) => t.key === tab);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <BrandLogo href="" />
          <Link className={styles.ghostLink} href="/">
            Return to agent
          </Link>
        </div>
        <div className={styles.titleRow}>
          <div>
            <p className={styles.eyebrow}>Operations</p>
            <h1 className={styles.title}>Live conversations</h1>
            <p className={styles.lede}>
              Leads, appointment requests and handoffs captured by your published agent, as they arrive.
            </p>
          </div>
          <div className={styles.statusBar} data-state={connection}>
            <span className={styles.statusPill}>
              <span className={styles.statusDot} aria-hidden="true" />
              <span role="status">{connectionLabel[connection]}</span>
            </span>
            <span className={styles.statusMeta}>
              <span ref={updatedRef}>Syncing…</span>
              {connection === "reconnecting" && (
                <>
                  <span aria-hidden="true" className={styles.sep}>·</span>
                  <span ref={retryRef} />
                </>
              )}
              {connection === "paused" && (
                <>
                  <span aria-hidden="true" className={styles.sep}>·</span>
                  <span>resumes when you return</span>
                </>
              )}
            </span>
            <button
              type="button"
              className={styles.iconButton}
              onClick={refresh}
              disabled={connection === "signedOut" || fetching}
              aria-label="Refresh now"
              title="Refresh now"
              data-busy={fetching ? "true" : undefined}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                <path
                  d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v3.4h-3.4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <p className={styles.srOnly} aria-live="polite" role="log">
        {announcement}
      </p>

      {connection === "signedOut" && (
        <div className={styles.notice} data-tone="warm" role="alert">
          <div>
            <strong>Signed out — sign in again</strong>
            <span>Your session ended, so live updates have stopped. Records below are from your last sync.</span>
          </div>
          <a className={styles.noticeAction} href="/login?return_to=%2Fadmin">
            Sign in
          </a>
        </div>
      )}
      {loadError && connection !== "signedOut" && (
        <div className={styles.notice} data-tone="warm" role="alert">
          <div>
            <strong>Operations data could not be loaded</strong>
            <span>{loadError}</span>
          </div>
        </div>
      )}

      <section className={styles.metrics} aria-label="Summary">
        <article className={styles.metric}>
          <span className={styles.metricLabel}>Leads</span>
          <span className={styles.metricValue}>
            <Counter value={stats.leads.total} />
            {capped && stats.leads.total >= MAX_ROWS && <span className={styles.plus}>+</span>}
          </span>
          <span className={styles.metricSub}>
            <span className={stats.leads.today ? styles.delta : undefined}>
              {stats.leads.today ? `+${stats.leads.today}` : "0"}
            </span>{" "}
            today
          </span>
        </article>
        <article className={styles.metric}>
          <span className={styles.metricLabel}>
            <span className={styles.labelLong}>Appointment requests</span>
            <span className={styles.labelShort}>Appointments</span>
          </span>
          <span className={styles.metricValue}>
            <Counter value={stats.appointments.total} />
            {capped && stats.appointments.total >= MAX_ROWS && <span className={styles.plus}>+</span>}
          </span>
          <span className={styles.metricSub}>
            <span className={stats.appointments.pending ? styles.deltaWarm : undefined}>
              {stats.appointments.pending}
            </span>{" "}
            awaiting confirmation
          </span>
        </article>
        <article className={styles.metric}>
          <span className={styles.metricLabel}>Human handoffs</span>
          <span className={styles.metricValue}>
            <Counter value={stats.handoffs.total} />
            {capped && stats.handoffs.total >= MAX_ROWS && <span className={styles.plus}>+</span>}
          </span>
          <span className={styles.metricSub}>
            <span className={stats.handoffs.open ? styles.deltaWarm : undefined}>{stats.handoffs.open}</span> in
            queue
          </span>
        </article>
        <article className={styles.metric}>
          <span className={styles.metricLabel}>Phone minutes</span>
          <span className={styles.metricValue}>
            {summary ? <Counter value={stats.phoneMinutes.total} /> : <span className={styles.pending}>—</span>}
          </span>
          <span className={styles.metricSub}>
            {summary ? (
              <>
                <span className={stats.phoneMinutes.today ? styles.delta : undefined}>
                  {stats.phoneMinutes.today}
                </span>{" "}
                today · billed per started minute
              </>
            ) : (
              "Available after first sync"
            )}
          </span>
        </article>
      </section>

      <div className={styles.workspace}>
        <section className={styles.panel} aria-label="Records">
          <div className={styles.panelHead}>
            <div className={styles.segmented} role="tablist" aria-label="Record type" style={{ ["--index" as string]: tabIndex }}>
              <span className={styles.segmentIndicator} aria-hidden="true" />
              {TABS.map((t) => (
                <button
                  key={t.key}
                  ref={(el) => {
                    tabRefs.current[t.key] = el;
                  }}
                  id={`op-tab-${t.key}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  aria-controls="op-panel"
                  tabIndex={tab === t.key ? 0 : -1}
                  className={styles.segment}
                  onClick={() => selectTab(t.key)}
                  onKeyDown={onTabKeyDown}
                >
                  <span>{t.label}</span>
                  <span className={styles.segmentCount}>{totals[t.key].toLocaleString("en-IN")}</span>
                  {unseen[t.key] > 0 && (
                    <span className={styles.unseen} aria-label={`${unseen[t.key]} new`}>
                      +{unseen[t.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <label className={styles.search}>
              <span className={styles.srOnly}>Filter {activeTab.label.toLowerCase()}</span>
              <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="m13.2 13.2 3.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter ${activeTab.label.toLowerCase()}`}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>

          <div id="op-panel" role="tabpanel" aria-labelledby={`op-tab-${tab}`} className={styles.panelBody} key={tab}>
            {visibleRows.length ? (
              <ol className={styles.rows}>
                {visibleRows.map((row, index) => {
                  const isOpen = expanded === row.id;
                  const primaryContact = row.contacts.find((c) => c.href) || row.contacts[0];
                  return (
                    <li
                      key={row.id}
                      id={`op-row-${row.id}`}
                      className={styles.row}
                      data-fresh={fresh[row.id] ? "true" : undefined}
                      data-open={isOpen ? "true" : undefined}
                      style={{ ["--i" as string]: Math.min(index, 10) }}
                      onClick={(e) => onRowClick(e, row.id)}
                    >
                      <div className={styles.rowInner}>
                        <div className={styles.rowMain}>
                          <span className={styles.avatar} data-kind={row.kind} aria-hidden="true">
                            {initials(row.title)}
                          </span>
                          <div className={styles.cellWho}>
                            <strong>{row.title}</strong>
                            <span>{row.subtitle}</span>
                          </div>
                          <div className={styles.cellWhat}>
                            <strong>{row.primary}</strong>
                            {row.secondary && <span>{row.secondary}</span>}
                          </div>
                          <div className={styles.cellContact}>
                            {primaryContact ? (
                              primaryContact.href ? (
                                <a href={primaryContact.href} className={styles.contactLink}>
                                  {primaryContact.label}
                                </a>
                              ) : (
                                <span>{primaryContact.label}</span>
                              )
                            ) : (
                              <span className={styles.faint}>No contact</span>
                            )}
                          </div>
                          <time
                            className={styles.cellTime}
                            dateTime={row.createdAtMs ? new Date(row.createdAtMs).toISOString() : undefined}
                            title={formatIst(row.createdAtMs)}
                          >
                            {relativeTime(row.createdAtMs, now)}
                          </time>
                          <div className={styles.cellChips}>
                            {row.chips.map((chip) => (
                              <span key={chip.label} className={styles.chip} data-tone={chip.tone}>
                                {chip.label}
                              </span>
                            ))}
                          </div>
                          <button
                            type="button"
                            className={styles.expand}
                            aria-expanded={isOpen}
                            aria-controls={`op-detail-${row.id}`}
                            aria-label={`${isOpen ? "Hide" : "Show"} details for ${row.title}`}
                            onClick={() => toggleRow(row.id)}
                          >
                            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                              <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                        <div className={styles.detail} id={`op-detail-${row.id}`} hidden={!isOpen}>
                          <div className={styles.detailInner}>
                            <dl className={styles.detailGrid}>
                              {row.details.map(([label, value]) => (
                                <div key={label}>
                                  <dt>{label}</dt>
                                  <dd>{value}</dd>
                                </div>
                              ))}
                            </dl>
                            {row.contacts.length > 0 && (
                              <div className={styles.detailActions}>
                                {row.contacts
                                  .filter((c) => c.href)
                                  .map((c) => (
                                    <a key={c.href} className={styles.action} href={c.href}>
                                      {c.kind === "phone" ? "Call" : "Email"} {c.label}
                                    </a>
                                  ))}
                                <button
                                  type="button"
                                  className={styles.action}
                                  data-done={copied === row.id ? "true" : undefined}
                                  onClick={() => void copyContact(row.contacts.map((c) => c.label).join(", "), row.id)}
                                >
                                  {copied === row.id ? "Copied" : "Copy contact"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : normalisedQuery ? (
              <div className={styles.empty}>
                <strong>No {activeTab.label.toLowerCase()} match “{query.trim()}”</strong>
                <p>Filtering searches names, services and contact details in the latest {MAX_ROWS} records.</p>
                <button type="button" className={styles.action} onClick={() => setQuery("")}>
                  Clear filter
                </button>
              </div>
            ) : (
              <EmptyState tab={tab} />
            )}
            {!normalisedQuery && totals[tab] > views[tab].length && views[tab].length >= MAX_ROWS && (
              <p className={styles.capNote}>
                Showing the latest {MAX_ROWS} of {plural(totals[tab], activeTab.noun)}.
              </p>
            )}
          </div>
        </section>

        <aside className={styles.rail} aria-label="Recent activity">
          <div className={styles.railHead}>
            <h2>Recent activity</h2>
            <span>All types · IST</span>
          </div>
          {activity.length ? (
            <ol className={styles.feed}>
              {activity.map((row) => (
                <li key={`${row.kind}-${row.id}`} data-fresh={fresh[row.id] ? "true" : undefined}>
                  <button type="button" className={styles.feedItem} onClick={() => openFromActivity(row)}>
                    <span className={styles.feedDot} data-kind={row.kind} aria-hidden="true" />
                    <span className={styles.feedText}>
                      <span className={styles.feedKind}>
                        {row.kind === "leads" ? "Lead" : row.kind === "appointments" ? "Appointment" : "Handoff"}
                      </span>
                      <strong>{row.title}</strong>
                      <span className={styles.feedSub}>{row.kind === "handoffs" ? row.primary : row.subtitle}</span>
                    </span>
                    <time className={styles.feedTime}>{relativeTime(row.createdAtMs, now)}</time>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.railEmpty}>Nothing yet. New records appear here within seconds of a call.</p>
          )}
          <p className={styles.railFoot}>
            Showing records owned by <span>{initial.ownerEmail}</span>. Checks for new records every 5 seconds while
            this tab is open.
          </p>
        </aside>
      </div>
    </main>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const copy: Record<TabKey, { title: string; body: string }> = {
    leads: {
      title: "No leads yet",
      body: "A lead is saved when a caller on your website voice agent, or on a phone call to your published agent, agrees to share their details. It appears here within seconds.",
    },
    appointments: {
      title: "No appointment requests yet",
      body: "When a caller asks to book a time, the agent records the request for your team to confirm. Nothing is booked automatically.",
    },
    handoffs: {
      title: "No handoffs in the queue",
      body: "The agent queues a handoff when a caller asks for a person, raises a complaint, or needs something outside its approved answers.",
    },
  };
  return (
    <div className={styles.empty}>
      <span className={styles.emptyMark} aria-hidden="true" />
      <strong>{copy[tab].title}</strong>
      <p>{copy[tab].body}</p>
      <Link className={styles.action} href="/studio">
        Open Studio
      </Link>
    </div>
  );
}
