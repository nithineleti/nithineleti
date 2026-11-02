"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "./live-preview.module.css";

/* ------------------------------------------------------------------------ */
/* Types                                                                    */
/* ------------------------------------------------------------------------ */

export type PreviewConfig = {
  businessName: string;
  industry: string;
  primaryGoal: string;
  agentTypeLabel: string;
  languages: string[];
  voice: string;
  voiceLabel: string;
  voiceDetail: string;
  tone: string;
  channels: string[];
  capabilities: string[];
};

export type ReadinessItem = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  required: boolean;
  step: number;
};

/** Values returned by the server once the agent really exists. */
export type FinalAgent = { name: string; welcomeMessage: string };

type Phase = "idle" | "ringing" | "speaking";
type AudioMode = "untried" | "audio" | "text";

/* ------------------------------------------------------------------------ */
/* Derivations shared with the server                                       */
/* ------------------------------------------------------------------------ */

/** Mirrors app/api/agents/route.ts so the preview name matches the fallback. */
export function previewAgentName(businessName: string) {
  return `${businessName.trim().split(/\s+/)[0] || "Client"} Assistant`;
}

/** Mirrors the server's fallback welcome message. */
export function previewWelcome(businessName: string) {
  const business = businessName.trim();
  const name = previewAgentName(business);
  return `Hello, you’re speaking with ${name} from ${business || "your business"}. How may I help you today?`;
}

function monogram(businessName: string) {
  const parts = businessName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AX";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
  return letters.toUpperCase();
}

/* ------------------------------------------------------------------------ */
/* Deterministic example conversation                                       */
/* ------------------------------------------------------------------------ */

type Turn = { who: "agent" | "caller"; text: string };

const callers = [
  ["Ravi Kumar", "Benz Circle"],
  ["Lakshmi Prasanna", "Governorpet"],
  ["Srinivas Rao", "Patamata"],
  ["Priya Reddy", "Labbipet"],
  ["Venkatesh", "Moghalrajpuram"],
  ["Anjali Devi", "Gunadala"],
] as const;

const regionalGreeting: Record<string, string> = {
  telugu: "Namaskaram",
  hindi: "Namaste",
  tamil: "Vanakkam",
  kannada: "Namaskara",
  malayalam: "Namaskaram",
  marathi: "Namaskar",
  urdu: "Assalamu alaikum",
  bengali: "Nomoskar",
};

function hash(text: string) {
  let value = 7;
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value;
}

function toneVoice(tone: string) {
  const t = tone.toLowerCase();
  const concise = /concise|direct|brief|short/.test(t);
  let ack = "Sure.";
  if (/formal|precise|professional/.test(t)) ack = "Certainly.";
  if (/warm|caring|kind/.test(t)) ack = "Of course.";
  if (/friendly|energetic|upbeat|cheerful/.test(t)) ack = "Happy to help!";
  if (/calm|reassur|gentle|patient/.test(t)) ack = "No problem at all.";
  return { ack, concise };
}

export function buildExampleConversation(config: PreviewConfig): Turn[] {
  const business = config.businessName.trim() || "your business";
  const industry = config.industry.trim().toLowerCase();
  const goal = config.primaryGoal.toLowerCase();
  const [callerName, area] = callers[hash(`${business}|${industry}`) % callers.length];
  const firstName = callerName.split(" ")[0];
  const language = (config.languages[0] || "English").trim();
  const opener = regionalGreeting[language.toLowerCase()];
  const hello = opener ? `${opener}, ` : "Hello, ";
  const { ack, concise } = toneVoice(config.tone);
  const team = `the ${business} team`;
  const about = industry ? ` — I found your ${industry} online` : "";

  let turns: Turn[];
  if (/appoint|book|schedul|slot|consult|visit|reserv/.test(goal)) {
    turns = [
      { who: "caller", text: `${hello}this is ${callerName} from ${area}${about}. Can I get an appointment this Saturday morning?` },
      { who: "agent", text: `${ack} I can request a Saturday morning slot for you.${concise ? "" : " What is the visit regarding,"} ${concise ? "May I confirm your name?" : "and may I confirm your name?"}` },
      { who: "caller", text: `It’s ${callerName}. You can call me back on this same number.` },
      { who: "agent", text: `Thank you, ${firstName}. I’ve noted your request for Saturday morning — ${team} will call to confirm the exact time.` },
    ];
  } else if (/order|deliver|track|status|dispatch|shipment/.test(goal)) {
    turns = [
      { who: "caller", text: `${hello}I placed an order with ${business} on Monday and it hasn’t reached ${area} yet.` },
      { who: "agent", text: `${ack} Could you share the order number from your confirmation message?` },
      { who: "caller", text: "It’s AX-20417. I need it before Friday." },
      { who: "agent", text: `Thank you, I’ve noted AX-20417 and your Friday deadline. ${concise ? "" : "I won’t guess a delivery date — "}${team} will check the dispatch and update you today.` },
    ];
  } else if (/lead|enquir|inquir|quote|price|pricing|sales|qualif|cost/.test(goal)) {
    turns = [
      { who: "caller", text: `${hello}I’m ${callerName}${about}. What would it cost for my requirement?` },
      { who: "agent", text: `${ack} Pricing depends on the details, so I won’t quote a wrong figure. What are you looking for, and by when?` },
      { who: "caller", text: "For my shop near the bus stand, ideally within two weeks." },
      { who: "agent", text: `Got it — a shop near the bus stand, within two weeks. May I share this with ${team} so they can send an exact quote?` },
    ];
  } else if (/support|complain|issue|problem|repair|service request|fault/.test(goal)) {
    turns = [
      { who: "caller", text: `${hello}this is ${callerName}. I have a problem with what I bought from ${business} last week.` },
      { who: "agent", text: `I’m sorry to hear that. ${concise ? "What went wrong?" : "Could you tell me what happened, so I can note it correctly?"}` },
      { who: "caller", text: "It stopped working after two days. I want a replacement." },
      { who: "agent", text: `${ack} I’ve noted the issue and your replacement request. I’m handing this to ${team} — a person will call you back.` },
    ];
  } else {
    turns = [
      { who: "caller", text: `${hello}this is ${callerName} from ${area}. What all do you offer at ${business}?` },
      {
        who: "agent",
        text: config.primaryGoal.trim()
          ? `${ack} I’m here to ${config.primaryGoal.trim().replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())}. What would you like to know?`
          : `${ack} Tell me what you’re looking for and I’ll help or connect you to the right person.`,
      },
      { who: "caller", text: "Are you open on Sunday?" },
      { who: "agent", text: `I don’t want to guess the timings. May I take your name so ${team} can confirm and call you back?` },
    ];
  }

  return turns.map((turn) => ({ ...turn, text: turn.text.replace(/\s+/g, " ").trim() }));
}

/* ------------------------------------------------------------------------ */
/* Small presentational helpers                                             */
/* ------------------------------------------------------------------------ */

/** Remounts on change so the CSS crossfade runs only for the field that changed. */
function Live({ value, children, className }: { value: string; children?: ReactNode; className?: string }) {
  return (
    <span key={value} className={`${styles.live} ${className || ""}`}>
      {children ?? value}
    </span>
  );
}

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Realistic speaking cadence: ~2.6 words/sec plus pauses at punctuation. */
function wordTiming(word: string) {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, "").length;
  const speak = 190 + Math.min(letters, 12) * 26;
  let pause = 40;
  if (/[.?!]["”’)]*$/.test(word)) pause = 420;
  else if (/[,;:—–]["”’)]*$/.test(word) || word === "—") pause = 200;
  return { speak, pause, syllables: Math.max(1, Math.round(letters / 3)) };
}

/* ------------------------------------------------------------------------ */
/* Readiness meter                                                          */
/* ------------------------------------------------------------------------ */

export function ReadinessMeter({ items, onJump }: { items: ReadinessItem[]; onJump: (step: number) => void }) {
  const done = items.filter((item) => item.done).length;
  const ratio = items.length ? done / items.length : 0;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const requiredMissing = items.filter((item) => item.required && !item.done);
  const summary =
    done === items.length
      ? "Ready to create"
      : requiredMissing.length
        ? `${requiredMissing.length} required ${requiredMissing.length === 1 ? "item" : "items"} left`
        : "Required items done";

  return (
    <section className={styles.readiness} aria-labelledby="readiness-title">
      <div className={styles.readinessHead}>
        <div className={styles.ring} role="img" aria-label={`${done} of ${items.length} readiness checks complete`}>
          <svg viewBox="0 0 56 56" aria-hidden="true">
            <circle className={styles.ringTrack} cx="28" cy="28" r={radius} />
            <circle
              className={styles.ringValue}
              cx="28"
              cy="28"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - ratio)}
              data-complete={done === items.length ? "true" : "false"}
            />
          </svg>
          <span className={styles.ringLabel}>
            {done}
            <small>/{items.length}</small>
          </span>
        </div>
        <div className={styles.readinessCopy}>
          <h2 id="readiness-title">Readiness</h2>
          <p aria-live="polite">{summary}</p>
        </div>
      </div>
      <ul className={styles.checklist}>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={styles.checkItem}
              data-done={item.done ? "true" : "false"}
              onClick={() => onJump(item.step)}
              aria-label={`${item.label}: ${item.done ? "done" : item.required ? "required, not done" : "not done"}. Go to step ${item.step}.`}
            >
              <span className={styles.checkIcon} aria-hidden="true">
                <svg viewBox="0 0 16 16">
                  <path d="M4 8.4 6.8 11 12 5.4" />
                </svg>
              </span>
              <span className={styles.checkText}>
                <strong>{item.label}</strong>
                <small>{item.done ? item.detail : item.required ? "Required" : "Recommended"}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Live phone preview                                                       */
/* ------------------------------------------------------------------------ */

const BAR_COUNT = 30;

export default function LivePreview({
  config,
  finalAgent,
  status,
}: {
  config: PreviewConfig;
  finalAgent: FinalAgent | null;
  status: "draft" | "ready" | "created";
}) {
  const agentName = finalAgent?.name || previewAgentName(config.businessName);
  const greeting = finalAgent?.welcomeMessage || previewWelcome(config.businessName);
  const example = useMemo(() => buildExampleConversation(config), [config]);
  const primaryLanguage = (config.languages[0] || "English").trim();
  const languageNote =
    primaryLanguage.toLowerCase() === "english" ? "" : `Agent replies in ${primaryLanguage} · shown here in English`;
  const business = config.businessName.trim();

  const [phase, setPhase] = useState<Phase>("idle");
  const [shownWords, setShownWords] = useState(0);
  const [streamWords, setStreamWords] = useState<string[]>([]);
  const [audioMode, setAudioMode] = useState<AudioMode>("untried");
  const [played, setPlayed] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Everything the animation loop touches lives in refs, never in state.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const timersRef = useRef<number[]>([]);
  const clockRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserData = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const ringStopRef = useRef<(() => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const audioCache = useRef(new Map<string, string>());
  const providerUnavailable = useRef(false);
  const wordRef = useRef({ start: 0, speak: 0, syllables: 1 });
  const barsRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const reducedMotion = useRef(false);
  const runToken = useRef(0);

  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, width, height);

    const bars = barsRef.current;
    const speaking = phaseRef.current === "speaking";
    const analyser = analyserRef.current;
    const audioEl = audioElRef.current;
    const audioLive = Boolean(analyser && audioEl && !audioEl.paused && !audioEl.ended);
    let freq: Uint8Array<ArrayBuffer> | null = null;
    if (audioLive && analyser) {
      if (!analyserData.current || analyserData.current.length !== analyser.frequencyBinCount) {
        analyserData.current = new Uint8Array(analyser.frequencyBinCount);
      }
      freq = analyserData.current;
      analyser.getByteFrequencyData(freq);
    }

    // Simulated envelope from the word currently being spoken.
    let envelope = 0;
    if (speaking && !freq) {
      const { start, speak, syllables } = wordRef.current;
      const t = now - start;
      if (t >= 0 && t < speak) {
        envelope = Math.abs(Math.sin((Math.PI * syllables * t) / speak)) ** 0.7;
        envelope *= 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now * 0.011));
      }
    }

    const mid = (BAR_COUNT - 1) / 2;
    for (let i = 0; i < BAR_COUNT; i += 1) {
      const distance = Math.abs(i - mid) / (BAR_COUNT / 2);
      let target = 0;
      if (freq) {
        const bin = Math.min(freq.length - 1, 1 + Math.floor(distance * freq.length * 0.55));
        target = (freq[bin] / 255) ** 1.3;
      } else if (envelope > 0) {
        const shape = 0.3 + 0.7 * (1 - distance) ** 1.5;
        const jitter = 0.62 + 0.38 * Math.sin(now * 0.017 + i * 1.73);
        target = envelope * shape * jitter;
      }
      bars[i] += (target - bars[i]) * (target > bars[i] ? 0.45 : 0.18);
    }

    const gap = 3;
    const barWidth = Math.max(2, (width - gap * (BAR_COUNT - 1)) / BAR_COUNT);
    const center = height / 2;
    for (let i = 0; i < BAR_COUNT; i += 1) {
      const h = Math.max(2, bars[i] * (height - 4));
      const x = i * (barWidth + gap);
      const alpha = 0.35 + Math.min(0.65, bars[i] * 1.4);
      ctx2d.fillStyle = `rgba(91, 224, 198, ${alpha.toFixed(3)})`;
      const r = Math.min(barWidth / 2, h / 2);
      ctx2d.beginPath();
      ctx2d.roundRect(x, center - h / 2, barWidth, h, r);
      ctx2d.fill();
    }
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current || document.visibilityState === "hidden") return;
    if (reducedMotion.current) {
      draw(performance.now());
      return;
    }
    const tick = (now: number) => {
      draw(now);
      const settling = barsRef.current.some((value) => value > 0.01);
      if (phaseRef.current === "speaking" || settling) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = 0;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [draw]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    if (clockRef.current) window.clearInterval(clockRef.current);
    clockRef.current = 0;
  }, []);

  const releaseAudio = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    ringStopRef.current?.();
    ringStopRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
  }, []);

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const stop = useCallback(() => {
    runToken.current += 1;
    clearTimers();
    releaseAudio();
    setPhaseBoth("idle");
    startLoop(); // lets the bars settle to rest, then the loop ends itself
  }, [clearTimers, releaseAudio, setPhaseBoth, startLoop]);

  // Mount / unmount: reduced-motion preference, visibility pausing, full teardown.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = media.matches;
    const onMotion = () => {
      reducedMotion.current = media.matches;
    };
    media.addEventListener("change", onMotion);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopLoop();
      else if (phaseRef.current === "speaking") startLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    draw(performance.now());
    const cache = audioCache.current;
    return () => {
      media.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
      runToken.current += 1;
      stopLoop();
      clearTimers();
      releaseAudio();
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, [clearTimers, draw, releaseAudio, startLoop, stopLoop]);

  // Redraw the resting state when the canvas is resized (layout change, rotation).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!rafRef.current) draw(performance.now());
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  async function fetchVoice(voice: string, signal: AbortSignal): Promise<string | null> {
    if (providerUnavailable.current) return null;
    const cached = audioCache.current.get(voice);
    if (cached) return cached;
    try {
      const response = await fetch(`/api/voice-preview?voice=${encodeURIComponent(voice)}`, { signal });
      if (response.status === 401 || response.status === 503) {
        providerUnavailable.current = true; // not signed in or no provider: stop asking this session
        return null;
      }
      if (!response.ok) return null;
      const type = response.headers.get("content-type") || "";
      if (!type.includes("audio")) return null;
      const url = URL.createObjectURL(await response.blob());
      audioCache.current.set(voice, url);
      return url;
    } catch {
      return null;
    }
  }

  function playRingback(ctx: AudioContext) {
    // Indian ringback: ~400 Hz modulated at 25 Hz, "ring-ring" 0.4s on / 0.2s off / 0.4s on.
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const low = ctx.createOscillator();
    const high = ctx.createOscillator();
    low.frequency.value = 387.5;
    high.frequency.value = 412.5;
    low.connect(gain);
    high.connect(gain);
    const t = ctx.currentTime + 0.05;
    const level = 0.03;
    gain.gain.setTargetAtTime(level, t, 0.01);
    gain.gain.setTargetAtTime(0, t + 0.4, 0.01);
    gain.gain.setTargetAtTime(level, t + 0.6, 0.01);
    gain.gain.setTargetAtTime(0, t + 1.0, 0.01);
    low.start(t);
    high.start(t);
    low.stop(t + 1.15);
    high.stop(t + 1.15);
    return () => {
      try {
        low.stop();
        high.stop();
      } catch {
        /* already stopped */
      }
      low.disconnect();
      high.disconnect();
      gain.disconnect();
    };
  }

  async function start() {
    if (phaseRef.current !== "idle") {
      stop();
      return;
    }
    const token = ++runToken.current;
    const words = greeting.split(/\s+/).filter(Boolean);
    setStreamWords(words);
    setShownWords(0);
    setElapsed(0);
    setPhaseBoth("ringing");

    // Created inside the click so browsers allow sound; reused for later plays.
    let audioCtx: AudioContext | null = null;
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtor) {
        ctxRef.current ??= new AudioCtor();
        audioCtx = ctxRef.current;
        if (audioCtx.state === "suspended") await audioCtx.resume();
        ringStopRef.current = playRingback(audioCtx);
      }
    } catch {
      audioCtx = null;
    }

    const startedAt = performance.now();
    clockRef.current = window.setInterval(() => {
      setElapsed(Math.floor((performance.now() - startedAt) / 1000));
    }, 1000);

    const controller = new AbortController();
    abortRef.current = controller;
    const fetchTimeout = new Promise<null>((resolve) => {
      timersRef.current.push(window.setTimeout(() => resolve(null), 4000));
    });
    const ring = new Promise<void>((resolve) => {
      timersRef.current.push(window.setTimeout(resolve, 1500));
    });
    const [audioUrl] = await Promise.all([Promise.race([fetchVoice(config.voice, controller.signal), fetchTimeout]), ring]);
    if (token !== runToken.current) return;
    ringStopRef.current?.();
    ringStopRef.current = null;

    let usingAudio = false;
    if (audioUrl && audioCtx) {
      try {
        const element = new Audio(audioUrl);
        const source = audioCtx.createMediaElementSource(element);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
        audioElRef.current = element;
        sourceRef.current = source;
        analyserRef.current = analyser;
        await element.play();
        usingAudio = true;
      } catch {
        audioElRef.current = null;
        sourceRef.current?.disconnect();
        sourceRef.current = null;
        analyserRef.current?.disconnect();
        analyserRef.current = null;
      }
    }
    if (token !== runToken.current) return;
    setAudioMode(usingAudio ? "audio" : "text");
    setPhaseBoth("speaking");
    startLoop();

    let index = 0;
    const speakNext = () => {
      if (token !== runToken.current) return;
      if (index >= words.length) {
        const finish = () => {
          if (token !== runToken.current) return;
          clearTimers();
          releaseAudio();
          setPlayed(true);
          setPhaseBoth("idle");
        };
        const element = audioElRef.current;
        if (element && !element.paused && !element.ended) {
          element.addEventListener("ended", finish, { once: true });
        } else {
          timersRef.current.push(window.setTimeout(finish, 350));
        }
        return;
      }
      const timing = wordTiming(words[index]);
      wordRef.current = { start: performance.now(), speak: timing.speak, syllables: timing.syllables };
      index += 1;
      setShownWords(index);
      if (!rafRef.current) startLoop();
      timersRef.current.push(window.setTimeout(speakNext, timing.speak + timing.pause));
    };
    speakNext();
  }

  const active = phase !== "idle";
  const statusText =
    phase === "ringing"
      ? "Connecting"
      : phase === "speaking"
        ? "Speaking"
        : status === "created"
          ? "Created"
          : status === "ready"
            ? "Ready to create"
            : "Draft";
  const bubbleText = phase === "speaking" ? streamWords.slice(0, shownWords).join(" ") : greeting;
  const modeNote =
    audioMode === "audio"
      ? `Voice sample · ${config.voiceLabel}. The audio is a standard sample line; your greeting streams as text.`
      : audioMode === "text"
        ? "Text preview — voice audio needs a configured provider"
        : "Simulated preview — no call is placed, no customer data";

  return (
    <div className={styles.previewWrap}>
      <div className={styles.device} data-phase={phase}>
        <span className={styles.sideKey} aria-hidden="true" />
        <div className={styles.screen}>
          <div className={styles.statusBar} aria-hidden="true">
            <span>Preview</span>
            <span className={styles.island} />
            <span className={styles.clock}>AgentX</span>
          </div>

          <div className={styles.identity}>
            <div className={styles.avatarWrap}>
              <span className={styles.ripple} aria-hidden="true" />
              <span className={styles.ripple} aria-hidden="true" />
              <div className={styles.avatar} aria-hidden="true">
                <Live value={monogram(business)} />
              </div>
            </div>
            <div className={styles.nameRow}>
              <h3 className={styles.agentName}>
                <Live value={agentName} />
              </h3>
              <span className={styles.nameTag}>{finalAgent ? "Final name" : "Preview name"}</span>
            </div>
            <p className={styles.business}>
              <Live value={business || "Business name not set"} className={business ? "" : styles.placeholder} />
              {config.industry.trim() && (
                <>
                  <span className={styles.dotSep} aria-hidden="true">·</span>
                  <Live value={config.industry.trim()} />
                </>
              )}
            </p>
            <span className={styles.statusChip} data-state={active ? phase : status}>
              <i aria-hidden="true" />
              {statusText}
              {active && <span className={styles.chipClock}>{formatClock(elapsed)}</span>}
            </span>
            <canvas ref={canvasRef} className={styles.voiceBars} aria-hidden="true" />
          </div>

          <div className={styles.specs}>
            <span className={styles.chip}>
              <b>Voice</b>
              <Live value={config.voiceLabel} />
            </span>
            <span className={`${styles.chip} ${styles.chipWide}`}>
              <b>Tone</b>
              <Live value={config.tone.trim() || "Not set"} />
            </span>
            <span className={styles.chip}>
              <b>Lang</b>
              <Live value={config.languages.join(" · ") || "None"} />
            </span>
            <span className={styles.chip}>
              <b>On</b>
              <Live value={config.channels.join(" · ") || "No channel"} />
            </span>
          </div>

          <div className={styles.transcript} data-active={active ? "true" : "false"}>
            <div className={styles.turnAgent}>
              <span className={styles.turnLabel}>
                {finalAgent ? "First spoken message" : "Draft greeting"}
              </span>
              <p className={styles.bubble} aria-live="polite" aria-atomic="false">
                {phase === "speaking" ? (
                  <>
                    {bubbleText}
                    <span className={styles.caret} aria-hidden="true" />
                  </>
                ) : phase === "ringing" ? (
                  <span className={styles.ringingText}>Ringing…</span>
                ) : (
                  <Live value={greeting} />
                )}
              </p>
            </div>

            <div className={styles.exampleDivider}>
              <span>Example — generated from your settings</span>
            </div>
            {languageNote && (
              <p className={styles.languageNote}>
                <Live value={languageNote} />
              </p>
            )}
            <ol className={styles.example} aria-label="Example conversation, generated from your settings">
              {example.map((turn, index) => (
                <li key={`${index}-${turn.who}`} className={turn.who === "agent" ? styles.turnAgent : styles.turnCaller}>
                  <span className={styles.turnLabel}>
                    {turn.who === "agent" ? agentName : "Caller"}
                  </span>
                  <p className={styles.bubble}>
                    <Live value={turn.text} />
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <div className={styles.controls}>
            <button
              type="button"
              className={styles.hearButton}
              data-active={active ? "true" : "false"}
              onClick={() => void start()}
              aria-label={active ? "Stop greeting preview" : played ? "Replay the greeting" : "Hear the greeting"}
            >
              <span className={styles.hearIcon} aria-hidden="true">
                {active ? (
                  <svg viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1.5" /></svg>
                ) : (
                  <svg viewBox="0 0 16 16"><path d="M5 3.5v9l7.5-4.5z" /></svg>
                )}
              </span>
              {phase === "ringing" ? "Connecting…" : phase === "speaking" ? "Stop" : played ? "Replay greeting" : "Hear the greeting"}
            </button>
            <p className={styles.modeNote} role="status">
              {modeNote}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
