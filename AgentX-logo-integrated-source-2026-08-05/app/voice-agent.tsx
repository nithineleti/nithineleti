"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import BrandLogo from "./brand-logo";
import { REALTIME_EVENT_CHANNEL } from "./realtime-protocol";
import CallTimer from "./home/call-timer";
import CapturePanel, { type CapturedField, type Outcome } from "./home/capture-panel";
import { CALLER_PROFILE, TOOL_DETAILS, type FieldKey, type SimPhase } from "./home/call-script";
import LiveWaveform from "./home/live-waveform";
import { CountUp, trackSpotlight, useScrollReveal } from "./home/motion";
import TranscriptPanel, { simulationEntries, type TranscriptEntry } from "./home/transcript-panel";
import { useSimulatedCall } from "./home/use-simulated-call";
import { VoiceSignal } from "./home/voice-signal";
import c from "./home/console.module.css";
import h from "./home/home.module.css";

const VoiceAvatar = dynamic(() => import("./voice-avatar"), { ssr: false });

type CallStatus = "idle" | "connecting" | "connected" | "error";
type Message = { id: string; role: "assistant" | "user" | "system"; text: string; final?: boolean };
type Tone = "idle" | "warm" | "live" | "done" | "error";

const statusText: Record<CallStatus, string> = {
  idle: "Ready when you are",
  connecting: "Connecting securely…",
  connected: "Listening",
  error: "Connection needs attention",
};

const phaseLabel: Record<SimPhase, [string, Tone]> = {
  idle: ["Ready", "idle"],
  dialing: ["Dialing", "warm"],
  ringing: ["Ringing", "warm"],
  connected: ["Connected", "live"],
  inCall: ["In call", "live"],
  wrapUp: ["Wrap-up", "warm"],
  completed: ["Completed", "done"],
  stopped: ["Ended", "idle"],
};

const SIM_RUNNING: SimPhase[] = ["dialing", "ringing", "connected", "inCall", "wrapUp"];

function Icon({ name }: { name: "mic" | "mute" | "stop" | "sparkle" | "arrow" | "play" | "replay" | "phone" }) {
  const paths = {
    mic: (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
      </>
    ),
    mute: (
      <>
        <path d="M9 9v1a3 3 0 0 0 5.12 2.12M15 9V5a3 3 0 0 0-5.91-.73M5 10a7 7 0 0 0 11.42 5.42M19 10a7 7 0 0 1-.75 3.15M12 17v5M8 22h8M3 3l18 18" />
      </>
    ),
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    sparkle: (
      <>
        <path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z" />
        <path d="m18.5 14 1 2.5L22 17.5l-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" />
      </>
    ),
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    play: <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />,
    replay: <path d="M4 12a8 8 0 1 0 2.34-5.66M4 4v4.5h4.5" />,
    phone: (
      <path d="M5 4h3.5l1.5 4.5-2.25 1.5a11 11 0 0 0 6.25 6.25L15.5 14l4.5 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
    ),
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

const activeCapabilities = [
  {
    number: "01",
    title: "Natural voice conversation",
    text: "Listens and responds in realtime with interruption handling, so callers can speak naturally.",
  },
  {
    number: "02",
    title: "Business Q&A",
    text: "Explains your services, process and approved company information without inventing details.",
  },
  {
    number: "03",
    title: "Multilingual assistance",
    text: "Adapts to the caller’s language when practical and keeps every answer short and voice-friendly.",
  },
  {
    number: "04",
    title: "Qualified lead capture",
    text: "Collects consent, name, business, service, location, timeline and preferred contact method.",
  },
  {
    number: "05",
    title: "Appointment requests",
    text: "Records a preferred date, time, timezone and contact for your team to confirm.",
  },
  {
    number: "06",
    title: "Human handoff",
    text: "Queues complaints, complex requests or people who simply prefer speaking with your team.",
  },
  {
    number: "07",
    title: "Live transcripts",
    text: "Shows the conversation as it happens and saves an audit trail for authorised follow-up.",
  },
  {
    number: "08",
    title: "Operations dashboard",
    text: "Keeps leads, appointment requests and human handoffs organised in one private workspace.",
  },
];

/** The business tools the voice agent can call (see app/agent-config.ts). */
const businessTools = ["create_lead", "request_appointment", "request_human_handoff"];

const readyIntegrations = [
  ["Calendar", "Check availability and confirm bookings"],
  ["Phone", "Handle inbound and outbound calls with Twilio or SIP"],
  ["WhatsApp", "Send approved follow-ups and reminders"],
  ["Email", "Deliver summaries, confirmations and staff alerts"],
  ["CRM", "Sync qualified leads and conversation outcomes"],
];

/** Stagger index for entrance and reveal transitions. */
function order(index: number) {
  return { "--i": index } as CSSProperties;
}

function argText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export default function VoiceAgent() {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [liveFields, setLiveFields] = useState<Partial<Record<FieldKey, CapturedField>>>({});
  const [liveOutcomes, setLiveOutcomes] = useState<Outcome[]>([]);
  const [signal] = useState(() => new VoiceSignal());
  const sim = useSimulatedCall(signal);

  const pageRef = useRef<HTMLElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const endedSecondsRef = useRef<number | null>(null);
  const conversationIdRef = useRef("");
  const toolCallsRef = useRef(new Set<string>());

  useScrollReveal(pageRef);

  const saveEvent = useCallback(
    (role: Message["role"], eventType: string, content = "") => {
      if (!conversationIdRef.current) return;
      void fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationIdRef.current,
          role,
          eventType,
          content,
        }),
      });
    },
    [],
  );

  const appendMessage = useCallback(
    (role: Message["role"], text: string, id = crypto.randomUUID()) => {
      if (!text.trim()) return;
      setMessages((current) => {
        const match = current.findIndex((item) => item.id === id);
        if (match >= 0) {
          const copy = [...current];
          copy[match] = { ...copy[match], text, final: true };
          return copy;
        }
        return [...current, { id, role, text, final: true }];
      });
    },
    [],
  );

  /** Tap a MediaStream for loudness without routing it to the speakers twice. */
  const tapStream = useCallback(
    (stream: MediaStream, role: "agent" | "caller") => {
      const context = audioContextRef.current;
      if (!context || context.state === "closed" || !stream.getAudioTracks().length) return;
      try {
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.2;
        source.connect(analyser);
        signal.attachAnalyser(role, analyser);
      } catch {
        // Visual only: a failed tap must never affect the call itself.
      }
    },
    [signal],
  );

  const releaseAudio = useCallback(() => {
    signal.detachAnalysers();
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }, [signal]);

  const liveSeconds = useCallback(() => {
    if (connectedAtRef.current === null) return endedSecondsRef.current;
    return Math.floor((performance.now() - connectedAtRef.current) / 1000);
  }, []);

  const stopCall = useCallback(() => {
    if (conversationIdRef.current) {
      saveEvent("system", "conversation.ended");
    }
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    releaseAudio();
    if (connectedAtRef.current !== null) {
      endedSecondsRef.current = Math.floor((performance.now() - connectedAtRef.current) / 1000);
    }
    connectedAtRef.current = null;
    setMuted(false);
    setStatus("idle");
  }, [releaseAudio, saveEvent]);

  useEffect(() => {
    return () => {
      stopCall();
    };
  }, [stopCall]);

  function recordLiveTool(name: string, args: Record<string, unknown>, state: Outcome["state"]) {
    const outcomeId = `${name}-${toolCallsRef.current.size}`;
    if (name === "create_lead" || name === "request_human_handoff" || name === "request_appointment") {
      setLiveFields((current) => {
        const next = { ...current };
        const put = (key: FieldKey, value: string) => {
          if (value) next[key] = { value, seq: Date.now() };
        };
        put("caller", argText(args.name));
        put("business", argText(args.company));
        put("service", argText(args.service));
        put("location", argText(args.location));
        put("timeline", argText(args.timeline));
        put("contact", argText(args.preferredContact) || argText(args.contact) || argText(args.phone) || argText(args.email));
        if (args.consentConfirmed === true) put("consent", "Confirmed by caller");
        return next;
      });
    }
    setLiveOutcomes((current) => {
      const detail = [argText(args.name), argText(args.service) || argText(args.reason)].filter(Boolean).join(" · ");
      const existing = current.findIndex((item) => item.tool === name && item.state === "running");
      if (existing >= 0) {
        const copy = [...current];
        copy[existing] = { ...copy[existing], state };
        return copy;
      }
      return [...current, { id: outcomeId, tool: name, state, detail }];
    });
  }

  async function executeTool(event: Record<string, unknown>) {
    const callId = String(event.call_id || "");
    if (!callId || toolCallsRef.current.has(callId)) return;
    toolCallsRef.current.add(callId);

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(String(event.arguments || "{}"));
    } catch {
      args = {};
    }
    const toolName = String(event.name || "");
    recordLiveTool(toolName, args, "running");

    let output: Record<string, unknown>;
    try {
      const response = await fetch("/api/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationIdRef.current,
          tool: event.name,
          arguments: args,
        }),
      });
      output = await response.json();
    } catch {
      output = { ok: false, error: "The business system is temporarily unavailable." };
    }
    recordLiveTool(toolName, args, output.ok === true ? "done" : "failed");

    channelRef.current?.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output),
        },
      }),
    );
    channelRef.current?.send(JSON.stringify({ type: "response.create" }));
  }

  function handleEvent(event: Record<string, unknown>) {
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = String(event.transcript || "");
      appendMessage("user", transcript, String(event.item_id || crypto.randomUUID()));
      saveEvent("user", String(event.type), transcript);
    }

    if (
      event.type === "response.output_audio_transcript.delta" ||
      event.type === "response.audio_transcript.delta"
    ) {
      const id = String(event.item_id || event.response_id || "assistant-live");
      const delta = String(event.delta || "");
      setMessages((current) => {
        const match = current.findIndex((item) => item.id === id);
        if (match < 0) return [...current, { id, role: "assistant", text: delta }];
        const copy = [...current];
        copy[match] = { ...copy[match], text: copy[match].text + delta };
        return copy;
      });
    }

    if (
      event.type === "response.output_audio_transcript.done" ||
      event.type === "response.audio_transcript.done"
    ) {
      const id = String(event.item_id || event.response_id || "assistant-live");
      setMessages((current) => current.map((item) => (item.id === id ? { ...item, final: true } : item)));
      saveEvent("assistant", String(event.type), String(event.transcript || ""));
    }

    if (event.type === "response.function_call_arguments.done") {
      void executeTool(event);
    }

    if (event.type === "error") {
      // The realtime provider's own error text can name the vendor, the model or
      // internal session fields. Keep it in the console for debugging and show
      // the caller a neutral message instead.
      const nested = event.error as { message?: string } | undefined;
      if (nested?.message) {
        console.error("Realtime session error:", nested.message);
      }
      setError("The voice service reported a problem. Please try again.");
      setStatus("error");
    }
  }

  async function startCall() {
    if (!consent) {
      setError("Please confirm the conversation-data notice before starting.");
      return;
    }

    sim.stop();
    setError("");
    setStatus("connecting");
    setMessages([]);
    setLiveFields({});
    setLiveOutcomes([]);
    endedSecondsRef.current = null;
    toolCallsRef.current.clear();

    // Created inside the click so autoplay policy lets it run. It only meters
    // loudness for the visuals; it never plays or records anything.
    releaseAudio();
    try {
      audioContextRef.current = new AudioContext();
      void audioContextRef.current.resume().catch(() => undefined);
    } catch {
      audioContextRef.current = null;
    }

    try {
      const peer = new RTCPeerConnection();
      peer.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
          void audioRef.current.play();
        }
        // Tap the remote MediaStream itself (not the <audio> element).
        if (event.streams[0]) tapStream(event.streams[0], "agent");
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      tapStream(stream, "caller");

      const channel = peer.createDataChannel(REALTIME_EVENT_CHANNEL);
      channel.addEventListener("open", () => {
        connectedAtRef.current = performance.now();
        setStatus("connected");
        saveEvent("system", "conversation.connected");
        channel.send(
          JSON.stringify({
            type: "response.create",
            response: {
              instructions:
                "Greet the caller briefly as AgentX from Creators Touch and ask how you can help.",
            },
          }),
        );
      });
      channel.addEventListener("message", ({ data }) => {
        try {
          handleEvent(JSON.parse(data) as Record<string, unknown>);
        } catch {
          // Ignore malformed non-JSON data channel messages.
        }
      });
      channel.addEventListener("close", () => {
        if (connectedAtRef.current !== null) {
          endedSecondsRef.current = Math.floor((performance.now() - connectedAtRef.current) / 1000);
        }
        connectedAtRef.current = null;
        releaseAudio();
        setStatus("idle");
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch("/api/session", {
        method: "POST",
        headers: {
          "content-type": "application/sdp",
          "x-recording-consent": "true",
        },
        body: offer.sdp,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "The voice session could not be started.");
      }

      // The server owns the conversation id; adopt it so transcript events and
      // tool results are filed against the row it actually created.
      conversationIdRef.current = response.headers.get("x-conversation-id") || "";

      await peer.setRemoteDescription({
        type: "answer",
        sdp: await response.text(),
      });
      peerRef.current = peer;
      channelRef.current = channel;
      streamRef.current = stream;
    } catch (startError) {
      stopCall();
      const message =
        startError instanceof DOMException && startError.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow access and try again."
          : startError instanceof Error
            ? startError.message
            : "The voice session could not start.";
      setError(message);
      setStatus("error");
    }
  }

  function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  }

  function startSimulation() {
    if (status === "connecting" || status === "connected") return;
    setError("");
    setStatus("idle");
    sim.start();
  }

  const isLive = status === "connected";
  const liveView = status !== "idle";
  const simPhase = sim.state.phase;
  const simRunning = SIM_RUNNING.includes(simPhase);
  const simActive = simRunning && simPhase !== "dialing";

  // Header state ----------------------------------------------------------
  const [phaseText, phaseTone]: [string, Tone] = liveView
    ? status === "connected"
      ? ["Live", "live"]
      : status === "connecting"
        ? ["Connecting", "warm"]
        : ["Needs attention", "error"]
    : phaseLabel[simPhase];

  // Who is talking (simulation only; the live avatar colours itself) -------
  const currentTurn = sim.timeline.turns[sim.state.turn];
  const simSpeaking =
    !liveView && simPhase === "inCall" && currentTurn && sim.state.finished <= sim.state.turn
      ? currentTurn.speaker
      : null;
  const speakerCaption = liveView
    ? isLive
      ? muted
        ? "Microphone muted"
        : "Live audio"
      : statusText[status]
    : sim.state.thinking
      ? "AgentX thinking"
      : simSpeaking === "agent"
        ? "AgentX speaking"
        : simSpeaking === "caller"
          ? "Caller speaking"
          : simPhase === "ringing"
            ? "Incoming call"
            : simPhase === "dialing"
              ? "Dialing"
              : simPhase === "inCall" || simPhase === "connected"
                ? "Listening"
                : simPhase === "wrapUp"
                  ? "Wrapping up"
                  : simPhase === "completed"
                    ? "Call ended"
                    : simPhase === "stopped"
                      ? "Stopped"
                      : "Idle";

  const callerName = liveView
    ? "You"
    : sim.state.fields.caller && !sim.state.fields.caller.pending
      ? CALLER_PROFILE.name
      : simRunning
        ? simPhase === "dialing" || simPhase === "ringing"
          ? "Incoming call"
          : "Unknown caller"
        : simPhase === "idle"
          ? "No active call"
          : CALLER_PROFILE.name;
  const callerSub = liveView
    ? "Browser microphone"
    : sim.state.fields.business
      ? CALLER_PROFILE.business
      : "Creators Touch · inbound line";

  // Transcript ----------------------------------------------------------------
  const transcriptEntries: TranscriptEntry[] = liveView
    ? messages.map((message) => ({
        kind: "turn",
        id: message.id,
        speaker: message.role === "assistant" ? "agent" : message.role === "user" ? "caller" : "system",
        label: message.role === "assistant" ? "AgentX" : message.role === "user" ? "You" : "System",
        initials: message.role === "assistant" ? "AX" : message.role === "user" ? "YOU" : "i",
        text: message.text,
        streaming: false,
        final: Boolean(message.final),
      }))
    : simulationEntries(sim.timeline, sim.state);
  const turnCount = transcriptEntries.filter((entry) => entry.kind === "turn").length;

  // Captured details --------------------------------------------------------
  const simOutcomes: Outcome[] = sim.state.tools.map((item) => ({
    id: item.tool,
    tool: item.tool,
    state: item.state,
    detail: item.state === "done" ? TOOL_DETAILS[item.tool].detail : "Waiting for the business system…",
  }));

  return (
    <main className={`marketingShell ${h.page}`} ref={pageRef}>
      <nav className="marketingNav">
        <BrandLogo />
        <div className="marketingNavLinks">
          <a className={h.navLink} href="#workflow">How it works</a>
          <Link className={h.navLink} href="/pricing">Pricing</Link>
          <Link className={h.navLink} href="/platform">Platform</Link>
          <Link className={h.navLink} href="/login">Sign in</Link>
          <Link className={`navLaunch ${h.navCta}`} href="/studio">Open studio <Icon name="arrow" /></Link>
        </div>
      </nav>

      <section className={h.hero}>
        <div className={h.heroHead}>
          <div className={h.heroTitle}>
            <p className={`productKicker ${h.enter}`} style={order(0)}><span />Voice operations for ambitious teams</p>
            <h1 className={h.enter} style={order(1)}>AgentX voice agents that <em>move work forward.</em></h1>
          </div>
          <div className={h.heroAside}>
            <p className={`${h.lede} ${h.enter}`} style={order(2)}>
              Design a dependable voice experience for your business: answer approved questions,
              capture high-intent leads, and route sensitive requests to the right person.
            </p>
            <div className={`${h.actions} ${h.enter}`} style={order(3)}>
              <Link className={`launchButton ${h.cta}`} href="/studio">Create an agent <Icon name="arrow" /></Link>
              <a className={`quietLink ${h.quiet}`} href="#workflow">Explore the workflow</a>
            </div>
            <div className={`trustStrip ${h.enter}`} style={order(4)} aria-label="AgentX operating principles">
              <span>Consent-first capture</span>
              <span>Human handoff</span>
              <span>Private workspace</span>
            </div>
          </div>
        </div>

        <section className={`${c.console} ${h.enter}`} style={order(5)} aria-label="AgentX voice console">
          <header className={c.head}>
            <div className={c.identity}>
              <span className={c.lineMark}><Icon name="phone" /></span>
              <div>
                <strong>AgentX Reception</strong>
                <small>Creators Touch · Vijayawada</small>
              </div>
            </div>
            <div className={c.headRight}>
              {liveView ? null : <span className={c.simTag}>Simulated call — no microphone, no customer data</span>}
              <span className={c.phase} data-tone={phaseTone} role="status">
                <i aria-hidden="true" />
                {phaseText}
              </span>
            </div>
          </header>

          <div className={c.grid}>
            <div className={c.callCol}>
              <div className={c.stage} data-phase={liveView ? status : simPhase} data-speaker={simSpeaking ?? undefined}>
                <div className={c.rings} aria-hidden="true"><i /><i /><i /></div>
                <VoiceAvatar active={isLive || simActive} signal={signal} className={c.avatar} />
                <span className={c.stageCaption} data-speaker={simSpeaking ?? undefined} aria-hidden="true">
                  <i />{speakerCaption}
                </span>
              </div>

              <div className={c.meter}>
                <div className={c.clockRow}>
                  <CallTimer
                    className={c.clock}
                    read={liveView ? liveSeconds : sim.callSeconds}
                    running={liveView ? isLive : simRunning}
                  />
                  <div className={c.caller}>
                    <strong>{callerName}</strong>
                    <small>{callerSub}</small>
                  </div>
                </div>
                <LiveWaveform signal={signal} className={c.wave} />
              </div>

              {error && <div className={c.error} role="alert">{error}</div>}

              {status === "connecting" || status === "connected" ? (
                <div className={c.controls}>
                  <div className={c.buttonRow}>
                    <button
                      className={c.iconButton}
                      type="button"
                      onClick={toggleMute}
                      disabled={!isLive}
                      aria-pressed={muted}
                      aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                    >
                      <Icon name={muted ? "mute" : "mic"} />
                    </button>
                    <button className={c.danger} type="button" onClick={stopCall}>
                      <Icon name="stop" />End call
                    </button>
                  </div>
                  <p className={c.hint}>Live session. The transcript is saved for follow-up as described in the Privacy Notice.</p>
                </div>
              ) : (
                <>
                  <div className={c.controls}>
                    {simRunning ? (
                      <div className={c.buttonRow}>
                        <button className={c.danger} type="button" onClick={sim.stop}>
                          <Icon name="stop" />Stop
                        </button>
                        <button className={c.secondary} type="button" onClick={startSimulation}>
                          <Icon name="replay" />Replay
                        </button>
                      </div>
                    ) : (
                      <button className={c.primary} type="button" onClick={startSimulation}>
                        <Icon name={simPhase === "idle" ? "play" : "replay"} />
                        {simPhase === "idle" ? "Start simulated call" : "Replay simulated call"}
                      </button>
                    )}
                    <p className={c.note}>A scripted example call. It uses no microphone and no customer data, and nothing is saved.</p>
                  </div>

                  <div className={c.live}>
                    <span className={c.liveLabel}>Or test it with your voice</span>
                    <label className={c.consent}>
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(event) => setConsent(event.target.checked)}
                      />
                      <span>
                        I understand this conversation may be transcribed to provide follow-up, as described in the <Link href="/privacy">Privacy Notice</Link>.
                      </span>
                    </label>
                    <button className={c.secondary} type="button" onClick={startCall}>
                      <Icon name="mic" />Test live voice
                    </button>
                    <p className={c.hint}>Live voice requires an AgentX account and a configured voice provider.</p>
                  </div>
                </>
              )}

              <audio ref={audioRef} autoPlay />
            </div>

            <div className={c.transcriptCol}>
              <TranscriptPanel
                entries={transcriptEntries}
                title={liveView ? "Live transcript" : "Transcript"}
                meta={
                  liveView
                    ? `${turnCount} message${turnCount === 1 ? "" : "s"}`
                    : simRunning && simPhase === "inCall"
                      ? "Streaming"
                      : `${turnCount} turn${turnCount === 1 ? "" : "s"}`
                }
                empty={
                  <div className={c.empty}>
                    <strong>
                      {status === "error" ? "Live session not started" : liveView ? "Waiting for the first words" : "No call in progress"}
                    </strong>
                    <p>
                      {status === "error"
                        ? "See the message beside the call controls, or run the simulated call instead."
                        : liveView
                        ? "AgentX will greet you as soon as the session connects."
                        : "Start the simulated call to watch a real enquiry unfold: a saree shop owner in Vijayawada asking Creators Touch for a website."}
                    </p>
                    {liveView ? null : (
                      <div className={c.emptySteps} aria-hidden="true">
                        <span>Ring</span><span>Qualify</span><span>Consent</span><span>Save lead</span><span>Hand off</span>
                      </div>
                    )}
                  </div>
                }
              />
            </div>

            <aside className={c.captureCol} aria-label="Details captured during the call">
              <CapturePanel
                fields={liveView ? liveFields : sim.state.fields}
                outcomes={liveView ? liveOutcomes : simOutcomes}
                placeholder={(liveView ? isLive : simPhase === "connected" || simPhase === "inCall") ? "Listening…" : "—"}
                actionsLabel={liveView ? "Actions" : "Would be recorded"}
                emptyActions={
                  liveView
                    ? "Tool results from this call appear here."
                    : "Business actions appear here when the agent calls a tool."
                }
                footnote={
                  liveView
                    ? "Only actions your business system confirms are shown as done."
                    : "Example only. In a live call these actions would be recorded in your private workspace; here nothing is saved."
                }
              />
            </aside>
          </div>
        </section>
      </section>

      <section className="outcomeBand" aria-label="Business outcomes">
        <div data-reveal="" style={order(0)}><strong>01</strong><span>Answer with approved knowledge</span></div>
        <div data-reveal="" style={order(1)}><strong>02</strong><span>Capture details with consent</span></div>
        <div data-reveal="" style={order(2)}><strong>03</strong><span>Escalate when a person is needed</span></div>
      </section>

      <section className="workflowSection" id="workflow">
        <header className="workflowHead">
          <div data-reveal="">
            <p className="productKicker"><span />Designed for accountable automation</p>
            <h2>Every call has a clear next step.</h2>
          </div>
          <div data-reveal="" style={order(1)}>
            <p>
              AgentX helps teams turn live conversations into organised work without pretending that every decision can be automated.
            </p>
            <div className={h.facts}>
              <div className={h.fact}>
                <CountUp value={activeCapabilities.length} />
                <span>capabilities</span>
              </div>
              <div className={h.fact}>
                <CountUp value={businessTools.length} />
                <span>business tools the agent can call</span>
              </div>
            </div>
            <div className={h.toolChips}>
              {businessTools.map((tool) => <code key={tool}>{tool}</code>)}
            </div>
          </div>
        </header>

        <div className={`workflowGrid ${h.spotGrid}`} onPointerMove={trackSpotlight}>
          {activeCapabilities.map((capability, index) => (
            <article
              className={`workflowCard ${h.spot}`}
              key={capability.number}
              data-spotlight=""
              data-reveal=""
              style={order(index % 4)}
            >
              <div className="workflowCardTop">
                <span>{capability.number}</span>
                <i>{capability.number === "01" || capability.number === "04" || capability.number === "06" ? "Core" : "Configured per agent"}</i>
              </div>
              <h3>{capability.title}</h3>
              <p>{capability.text}</p>
            </article>
          ))}
        </div>

        <div className="connectionBand" data-reveal="">
          <div className="connectionIntro">
            <span>Connect when ready</span>
            <h3>Bring your systems into the conversation.</h3>
            <p>
              Integrations are only presented as active once their account, permissions and confirmation path are in place.
            </p>
          </div>
          <div className={`connectionList ${h.rowHover}`}>
            {readyIntegrations.map(([name, detail]) => (
              <div key={name}>
                <span><i />{name}</span>
                <p>{detail}</p>
                <small>Connect account</small>
              </div>
            ))}
          </div>
        </div>

        <div className="controlNote" data-reveal="">
          <span>Human control stays visible</span>
          <p>
            AgentX does not confirm payments, appointments or external actions unless
            the connected system reports success. Sensitive and professional decisions
            are escalated to a person.
          </p>
        </div>
      </section>

      <section className="launchBand" data-reveal="">
        <div>
          <p className="productKicker"><span />Creator workspace</p>
          <h2>Build the agent your client can trust.</h2>
          <p>Capture business rules, languages, channels and guardrails in a structured blueprint before the first conversation goes live.</p>
        </div>
        <div className="launchBandActions">
          <Link className={`launchButton ${h.cta}`} href="/studio">Open Agent Studio <Icon name="arrow" /></Link>
          <Link className={`quietLink ${h.quiet}`} href="/platform">See the platform</Link>
        </div>
      </section>

      <footer className="marketingFooter">
        <span>AgentX by Creators Touch</span>
        <div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/platform">Release status</Link></div>
      </footer>
    </main>
  );
}
