/**
 * The simulated inbound call shown on the homepage.
 *
 * Everything here is an illustrative example: the caller, the shop and the
 * conversation are fictional, no microphone is used and nothing is saved.
 * The timeline is computed once and deterministically, so every replay has
 * identical pacing.
 */

export type Speaker = "agent" | "caller";

export type FieldKey =
  | "caller"
  | "business"
  | "service"
  | "location"
  | "timeline"
  | "contact"
  | "consent";

export type ToolKey = "create_lead" | "request_human_handoff";

export const FIELD_ORDER: { key: FieldKey; label: string }[] = [
  { key: "caller", label: "Caller" },
  { key: "business", label: "Business" },
  { key: "service", label: "Service" },
  { key: "location", label: "Location" },
  { key: "timeline", label: "Timeline" },
  { key: "contact", label: "Contact" },
  { key: "consent", label: "Consent" },
];

export const TOOL_DETAILS: Record<ToolKey, { result: string; detail: string }> = {
  create_lead: {
    result: "Lead saved",
    detail: "Ravi Teja · Sri Durga Silks · website + logo",
  },
  request_human_handoff: {
    result: "Callback queued",
    detail: "Designer callback · tomorrow after 10 AM · team confirms",
  },
};

type Capture = {
  /** Inclusive word range in the turn that carries the detail. */
  from: number;
  to: number;
  field: FieldKey;
  value: string;
  pending?: boolean;
};

type ScriptTurn = {
  speaker: Speaker;
  text: string;
  captures?: Capture[];
  /** Tools the agent calls while "thinking" before this turn. */
  toolsBefore?: ToolKey[];
};

export const CALLER_PROFILE = {
  name: "Ravi Teja",
  business: "Sri Durga Silks",
  firstName: "Ravi",
};

const SCRIPT: ScriptTurn[] = [
  {
    speaker: "agent",
    text: "Namaste, you've reached Creators Touch. I'm AgentX, the virtual receptionist. How can I help?",
  },
  {
    speaker: "caller",
    text: "Hi, I'm Ravi Teja from Sri Durga Silks, a saree shop. We need a proper website and a new logo.",
    captures: [
      { from: 2, to: 3, field: "caller", value: "Ravi Teja" },
      { from: 5, to: 10, field: "business", value: "Sri Durga Silks · saree retail" },
      { from: 15, to: 19, field: "service", value: "Website + logo refresh" },
    ],
  },
  {
    speaker: "agent",
    text: "Happy to help with a website and branding, Ravi. Where is the shop located?",
  },
  {
    speaker: "caller",
    text: "Governorpet, in Vijayawada.",
    captures: [{ from: 0, to: 2, field: "location", value: "Governorpet, Vijayawada" }],
  },
  {
    speaker: "agent",
    text: "Thank you. When would you like the new website to go live?",
  },
  {
    speaker: "caller",
    text: "Before Sankranti, so in about three months.",
    captures: [{ from: 0, to: 6, field: "timeline", value: "Before Sankranti · ~3 months" }],
  },
  {
    speaker: "agent",
    text: "May I save your name and contact number so our team can follow up?",
    captures: [{ from: 1, to: 2, field: "consent", value: "Asked — waiting for answer", pending: true }],
  },
  {
    speaker: "caller",
    text: "Yes, that's fine. WhatsApp on this same number is best.",
    captures: [
      { from: 0, to: 2, field: "consent", value: "Given verbally" },
      { from: 3, to: 7, field: "contact", value: "WhatsApp · calling number" },
    ],
  },
  {
    speaker: "agent",
    text: "Saved. Would you like one of our designers to call you back?",
    toolsBefore: ["create_lead"],
  },
  {
    speaker: "caller",
    text: "Yes, tomorrow morning after ten works.",
  },
  {
    speaker: "agent",
    text: "Done. I've requested a callback for tomorrow after 10 AM, and the team will confirm the time.",
    toolsBefore: ["request_human_handoff"],
  },
  {
    speaker: "caller",
    text: "Perfect. Thank you!",
  },
];

export type TimelineTurn = {
  speaker: Speaker;
  words: string[];
  /** Word indexes (inclusive ranges) worth highlighting as extracted. */
  marks: [number, number][];
  /** Offset from "connected", in ms, for the transcript timestamp. */
  at: number;
  /** Full text, for the screen-reader announcement once the turn ends. */
  text: string;
  /** Tool calls the agent makes just before this turn. */
  tools: ToolKey[];
};

export type TimelineEvent =
  | { t: number; type: "phase"; phase: SimPhase }
  | { t: number; type: "thinking"; on: boolean }
  | { t: number; type: "turn"; turn: number }
  | { t: number; type: "word"; turn: number; word: number; duration: number }
  | { t: number; type: "turnEnd"; turn: number }
  | { t: number; type: "capture"; field: FieldKey; value: string; pending: boolean }
  | { t: number; type: "tool"; tool: ToolKey; state: "running" | "done" };

export type SimPhase =
  | "idle"
  | "dialing"
  | "ringing"
  | "connected"
  | "inCall"
  | "wrapUp"
  | "completed"
  | "stopped";

export type Timeline = {
  turns: TimelineTurn[];
  events: TimelineEvent[];
  connectedAt: number;
  endedAt: number;
  duration: number;
};

/** Small deterministic PRNG so jitter is natural but replays are identical. */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

const DIALING_MS = 900;
const RINGING_MS = 1500;
const CONNECTED_MS = 650;

/**
 * ~2.6–2.8 words per second: a base per word, a little per character, and
 * longer holds on commas and sentence ends.
 */
function wordDuration(word: string, speaker: Speaker, random: () => number) {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, "").length;
  let duration = 205 + letters * 21 + (random() - 0.5) * 50;
  if (speaker === "caller") duration *= 0.96;
  return Math.round(duration);
}

function trailingPause(word: string) {
  if (/[.!?]$/.test(word)) return 300;
  if (/[,;:—]$/.test(word)) return 160;
  return 40;
}

export function buildTimeline(): Timeline {
  const random = mulberry32(20261004);
  const events: TimelineEvent[] = [];
  const turns: TimelineTurn[] = [];

  let t = 0;
  events.push({ t, type: "phase", phase: "dialing" });
  t += DIALING_MS;
  events.push({ t, type: "phase", phase: "ringing" });
  t += RINGING_MS;
  events.push({ t, type: "phase", phase: "connected" });
  const connectedAt = t;
  t += CONNECTED_MS;
  events.push({ t, type: "phase", phase: "inCall" });

  SCRIPT.forEach((turn, index) => {
    const previous = SCRIPT[index - 1];
    if (turn.speaker === "agent" && previous) {
      // The agent "thinks" before answering; tool calls make it think longer.
      events.push({ t, type: "thinking", on: true });
      const tools = turn.toolsBefore ?? [];
      let thinkFor = 520 + random() * 240;
      tools.forEach((tool) => {
        events.push({ t: t + 180, type: "tool", tool, state: "running" });
        events.push({ t: t + 180 + 760, type: "tool", tool, state: "done" });
        thinkFor = Math.max(thinkFor, 1050 + random() * 150);
      });
      t += thinkFor;
      events.push({ t, type: "thinking", on: false });
    } else if (previous) {
      t += 360 + random() * 280;
    } else {
      t += 250;
    }

    const words = turn.text.split(/\s+/);
    turns.push({
      speaker: turn.speaker,
      words,
      marks: (turn.captures ?? []).filter((capture) => !capture.pending).map((capture) => [capture.from, capture.to]),
      at: t - connectedAt,
      text: turn.text,
      tools: turn.toolsBefore ?? [],
    });
    events.push({ t, type: "turn", turn: index });

    words.forEach((word, wordIndex) => {
      const duration = wordDuration(word, turn.speaker, random);
      events.push({ t, type: "word", turn: index, word: wordIndex, duration });
      for (const capture of turn.captures ?? []) {
        if (capture.to === wordIndex) {
          events.push({
            t: t + duration,
            type: "capture",
            field: capture.field,
            value: capture.value,
            pending: Boolean(capture.pending),
          });
        }
      }
      t += duration + trailingPause(word);
    });
    events.push({ t, type: "turnEnd", turn: index });
  });

  t += 700;
  const endedAt = t;
  events.push({ t, type: "phase", phase: "wrapUp" });
  t += 1600;
  events.push({ t, type: "phase", phase: "completed" });

  events.sort((a, b) => a.t - b.t);
  return { turns, events, connectedAt, endedAt, duration: t };
}
