"use client";

import Link from "next/link";
import BrandLogo from "../brand-logo";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { REALTIME_EVENT_CHANNEL } from "../realtime-protocol";
import s from "../login/auth.module.css";
import a from "./access.module.css";

type AccessedAgent = {
  id: string;
  name: string;
  businessName: string;
  agentType: string;
  primaryGoal: string;
  languages: string;
  voice: string;
  tone: string;
  channels: string;
  capabilities: string;
  integrations: string;
  welcomeMessage: string;
  status: string;
};

type Editable = Pick<AccessedAgent, "name" | "primaryGoal" | "languages" | "voice" | "tone" | "welcomeMessage">;
type SaveState = "idle" | "saving" | "saved";

const voices = ["marin", "cedar", "coral", "alloy", "ash", "ballad", "echo", "sage", "shimmer", "verse"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BARS = 14;

function editable(agent: AccessedAgent): Editable {
  return {
    name: agent.name,
    primaryGoal: agent.primaryGoal,
    languages: agent.languages,
    voice: agent.voice,
    tone: agent.tone,
    welcomeMessage: agent.welcomeMessage,
  };
}

function idProblem(value: string) {
  if (!value.trim()) return "Enter the agent ID you were given.";
  if (!UUID_PATTERN.test(value.trim())) return "That isn't a full agent ID. It has 36 characters, in five hyphen-separated groups.";
  return "";
}
function keyProblem(value: string) {
  return value.trim() ? "" : "Enter the access key.";
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M1.8 10S4.8 4.2 10 4.2 18.2 10 18.2 10 15.2 15.8 10 15.8 1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.6" />
      {!open && <path d="M3 17 17 3" />}
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

/** Level meter driven by refs: the parent's rAF loop writes bar heights directly. */
function Meter({ label, barsRef }: { label: string; barsRef: RefObject<Array<HTMLSpanElement | null>> }) {
  return (
    <div className={a.meter}>
      <span className={a.meterLabel}>{label}</span>
      <div className={a.bars} aria-hidden="true">
        {Array.from({ length: BARS }, (_, index) => (
          <span key={index} ref={(node) => { barsRef.current[index] = node; }} />
        ))}
      </div>
    </div>
  );
}

export default function AgentAccessPage() {
  const [agentId, setAgentId] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [touched, setTouched] = useState({ id: false, key: false });
  const [agent, setAgent] = useState<AccessedAgent | null>(null);
  const [saved, setSaved] = useState<Editable | null>(null);
  const [activeKey, setActiveKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "connecting" | "live">("idle");
  const [elapsed, setElapsed] = useState(0);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<number | undefined>(undefined);

  // Audio analysis for the live meters. Everything per-frame lives in refs.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micAnalyser = useRef<AnalyserNode | null>(null);
  const agentAnalyser = useRef<AnalyserNode | null>(null);
  const micBars = useRef<Array<HTMLSpanElement | null>>([]);
  const agentBars = useRef<Array<HTMLSpanElement | null>>([]);
  const frameRef = useRef(0);
  const bins = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const idError = idProblem(agentId);
  const keyError = keyProblem(accessKey);
  const showIdError = touched.id ? idError : "";
  const showKeyError = touched.key ? keyError : "";

  const dirty = Boolean(agent && saved && JSON.stringify(editable(agent)) !== JSON.stringify(saved));

  const paintBars = useCallback((analyser: AnalyserNode | null, bars: Array<HTMLSpanElement | null>) => {
    const data = bins.current;
    if (!data) return;
    if (analyser) analyser.getByteFrequencyData(data);
    else data.fill(0);
    // Voice energy sits in the low bins; spread them across the bars.
    const usable = Math.floor(data.length * 0.45);
    const step = Math.max(1, Math.floor(usable / BARS));
    for (let index = 0; index < BARS; index += 1) {
      let sum = 0;
      for (let k = 0; k < step; k += 1) sum += data[index * step + k] || 0;
      const level = Math.min(1, sum / step / 200);
      const bar = bars[index];
      if (bar) bar.style.transform = `scaleY(${0.12 + level * 0.88})`;
    }
  }, []);

  const stopMeters = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }, []);

  const startMeters = useCallback(() => {
    stopMeters();
    if (document.visibilityState === "hidden") return;
    const loop = () => {
      paintBars(micAnalyser.current, micBars.current);
      paintBars(agentAnalyser.current, agentBars.current);
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
  }, [paintBars, stopMeters]);

  const stopVoice = useCallback(() => {
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    peerRef.current = null;
    streamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    stopMeters();
    micAnalyser.current = null;
    agentAnalyser.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setVoiceStatus("idle");
    setElapsed(0);
  }, [stopMeters]);

  // Pause the meter loop while the tab is hidden; release everything on unmount.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopMeters();
      else if (audioCtxRef.current) startMeters();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(savedTimer.current);
      stopVoice();
    };
  }, [startMeters, stopMeters, stopVoice]);

  // Session clock: once a second is plenty for a mm:ss readout.
  useEffect(() => {
    if (voiceStatus !== "live") return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [voiceStatus]);

  async function unlock() {
    setTouched({ id: true, key: true });
    if (idError) {
      idRef.current?.focus();
      return;
    }
    if (keyError) {
      keyRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/agent-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agentId.trim(), accessKey: accessKey.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { agent?: AccessedAgent; error?: string };
      if (!response.ok || !data.agent) throw new Error(data.error || "Access failed.");
      setAgent(data.agent);
      setSaved(editable(data.agent));
      setActiveKey(accessKey.trim());
      setAccessKey("");
      setShowKey(false);
    } catch (accessError) {
      setError(accessError instanceof Error ? accessError.message : "Access failed.");
    } finally {
      setBusy(false);
    }
  }

  function updateAgent(field: keyof AccessedAgent, value: string) {
    setAgent((current) => current ? { ...current, [field]: value } : current);
    if (saveState === "saved") setSaveState("idle");
  }

  async function saveAgent() {
    if (!agent) return;
    setBusy(true);
    setSaveState("saving");
    setError("");
    window.clearTimeout(savedTimer.current);
    try {
      const response = await fetch("/api/agent-access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          accessKey: activeKey,
          name: agent.name,
          primaryGoal: agent.primaryGoal,
          languages: agent.languages,
          voice: agent.voice,
          tone: agent.tone,
          welcomeMessage: agent.welcomeMessage,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Update failed.");
      setAgent((current) => current ? { ...current, status: "ready" } : current);
      setSaved(editable(agent));
      setSaveState("saved");
      savedTimer.current = window.setTimeout(() => setSaveState("idle"), 2400);
    } catch (saveError) {
      setSaveState("idle");
      setError(saveError instanceof Error ? saveError.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  function analyse(stream: MediaStream) {
    const context = audioCtxRef.current;
    if (!context) return null;
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    context.createMediaStreamSource(stream).connect(analyser);
    if (!bins.current) bins.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    return analyser;
  }

  async function startVoice() {
    if (!agent) return;
    setVoiceStatus("connecting");
    setError("");
    try {
      const AudioContextClass = window.AudioContext;
      audioCtxRef.current = AudioContextClass ? new AudioContextClass() : null;
      const peer = new RTCPeerConnection();
      peer.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
          void audioRef.current.play();
        }
        agentAnalyser.current = analyse(event.streams[0]);
      };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      micAnalyser.current = analyse(stream);
      startMeters();
      const channel = peer.createDataChannel(REALTIME_EVENT_CHANNEL);
      channel.addEventListener("open", () => {
        setVoiceStatus("live");
        channel.send(JSON.stringify({
          type: "response.create",
          response: { instructions: `Introduce yourself briefly as ${agent.name} and ask how you can help.` },
        }));
      });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch("/api/session", {
        method: "POST",
        headers: {
          "content-type": "application/sdp",
          "x-conversation-id": crypto.randomUUID(),
          "x-recording-consent": "true",
          "x-agent-id": agent.id,
          "x-agent-access-key": activeKey,
        },
        body: offer.sdp,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Voice could not start.");
      }
      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
      peerRef.current = peer;
      streamRef.current = stream;
    } catch (voiceError) {
      stopVoice();
      setError(voiceError instanceof Error ? voiceError.message : "Voice could not start.");
    }
  }

  function lock() {
    stopVoice();
    setAgent(null);
    setSaved(null);
    setActiveKey("");
    setSaveState("idle");
    setError("");
    setTouched({ id: false, key: false });
  }

  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <main className={s.shell}>
      <nav className="nav studioNav">
        <BrandLogo />
        <div className={`navRight ${s.navLinks}`}><Link href="/studio">Create agent</Link><span className="navBadge">Secure access</span></div>
      </nav>

      {!agent ? (
        <div className={s.stage}>
          <aside className={s.intro}>
            <p className={s.eyebrow}><span className={s.eyebrowDot} aria-hidden="true" />Private agent access</p>
            <h1>Open your AgentX.</h1>
            <p className={s.lede}>Enter the credentials you received when your voice agent was created to edit it and talk to it.</p>
            <ul className={s.facts}>
              <li><span className={s.factIcon} aria-hidden="true"><CheckIcon /></span>The key is checked on the server against a stored hash.</li>
              <li><span className={s.factIcon} aria-hidden="true"><CheckIcon /></span>Nothing about your key is saved in this browser.</li>
              <li><span className={s.factIcon} aria-hidden="true"><CheckIcon /></span>Your microphone is used only after you start a voice session.</li>
            </ul>
          </aside>

          <section className={s.card} aria-labelledby="access-title">
            <header className={s.cardHead}>
              <h2 id="access-title">Agent credentials</h2>
              <p>Both values were shown once, when the agent was created.</p>
            </header>
            <form
              className={s.form}
              noValidate
              onSubmit={(event) => { event.preventDefault(); void unlock(); }}
            >
              <div className={s.field} data-invalid={showIdError ? "true" : undefined}>
                <label htmlFor="agent-id">Agent ID</label>
                <div className={s.control}>
                  <input
                    ref={idRef}
                    id="agent-id"
                    className={s.mono}
                    value={agentId}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setAgentId(event.target.value)}
                    onBlur={() => agentId && setTouched((current) => ({ ...current, id: true }))}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    aria-invalid={Boolean(showIdError)}
                    aria-describedby={showIdError ? "agent-id-error" : undefined}
                  />
                  <span className={s.validMark} data-on={!idError ? "true" : undefined} aria-hidden="true"><CheckIcon /></span>
                </div>
                {showIdError && <p className={s.fieldError} id="agent-id-error">{showIdError}</p>}
              </div>
              <div className={s.field} data-invalid={showKeyError ? "true" : undefined}>
                <label htmlFor="access-key">Access key</label>
                <div className={s.control}>
                  <input
                    ref={keyRef}
                    id="access-key"
                    className={s.mono}
                    type={showKey ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={accessKey}
                    onChange={(event) => setAccessKey(event.target.value)}
                    onBlur={() => accessKey && setTouched((current) => ({ ...current, key: true }))}
                    placeholder="agentx_••••••••••••"
                    aria-invalid={Boolean(showKeyError)}
                    aria-describedby={showKeyError ? "access-key-error" : undefined}
                  />
                  <button
                    type="button"
                    className={s.reveal}
                    aria-label={showKey ? "Hide access key" : "Show access key"}
                    aria-pressed={showKey}
                    aria-controls="access-key"
                    onClick={() => setShowKey((value) => !value)}
                  >
                    <EyeIcon open={showKey} />
                  </button>
                </div>
                {showKeyError && <p className={s.fieldError} id="access-key-error">{showKeyError}</p>}
              </div>
              <button className={s.submit} type="submit" disabled={busy}>
                {busy ? <><span className={s.spinner} aria-hidden="true" />Checking…</> : "Open my agent"}
              </button>
            </form>
            {error && <p className={s.error} role="alert">{error}</p>}
            <small className={s.footnote}>Your key is sent securely for verification and is never stored in the browser.</small>
          </section>
        </div>
      ) : (
        <div className={`${s.stage} ${a.unlockedStage}`} data-wide="true">
          <section className={`${s.card} ${a.unlocked}`} aria-labelledby="agent-title">
            <header className={a.agentHead}>
              <span className={a.successMark} aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" /><path d="M7.5 12.5l3 3 6-7" /></svg>
              </span>
              <div className={a.agentTitle}>
                <p className={s.eyebrow}>Agent unlocked</p>
                <h1 id="agent-title">{agent.name}</h1>
                <p>{agent.businessName} · {agent.agentType}</p>
              </div>
              <span className={a.statusPill} data-status={agent.status}>{agent.status}</span>
            </header>

            <blockquote className={a.quote}>“{agent.welcomeMessage}”</blockquote>

            <dl className={a.meta}>
              {[
                ["Voice", agent.voice],
                ["Languages", agent.languages],
                ["Channels", agent.channels],
                ["Tone", agent.tone],
              ].map(([label, value], index) => (
                <div key={label} style={{ "--i": index } as CSSProperties}>
                  <dt>{label}</dt>
                  <dd>{value || "—"}</dd>
                </div>
              ))}
            </dl>

            <section className={a.voice} data-status={voiceStatus} aria-labelledby="voice-title">
              <div className={a.voiceHead}>
                <div>
                  <h2 id="voice-title">Talk to {agent.name}</h2>
                  <p className={a.voiceState} role="status">
                    <span className={a.voiceDot} aria-hidden="true" />
                    {voiceStatus === "idle" && "Not connected. Uses your microphone and speakers."}
                    {voiceStatus === "connecting" && "Connecting to the voice service…"}
                    {voiceStatus === "live" && (
                      <>Live · <span className={s.tabular}>{clock}</span></>
                    )}
                  </p>
                </div>
                {voiceStatus === "idle" ? (
                  <button type="button" className={s.submit} onClick={() => void startVoice()}>
                    <svg className={a.micIcon} viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="2.5" width="6" height="10" rx="3" /><path d="M4.5 10a5.5 5.5 0 0 0 11 0M10 15.5V18" /></svg>
                    Start voice session
                  </button>
                ) : (
                  <button type="button" className={`${s.secondary} ${a.endButton}`} onClick={stopVoice}>
                    {voiceStatus === "connecting" ? <><span className={s.spinner} aria-hidden="true" />Cancel</> : <><span className={a.stopIcon} aria-hidden="true" />End session</>}
                  </button>
                )}
              </div>
              {voiceStatus !== "idle" && (
                <div className={a.meters}>
                  <Meter label="You" barsRef={micBars} />
                  <Meter label={agent.name} barsRef={agentBars} />
                </div>
              )}
            </section>

            <div className={a.formHead}>
              <h2>Customise</h2>
              <span className={a.saveHint} data-state={dirty ? "dirty" : saveState} aria-live="polite">
                {saveState === "saving" ? "Saving…" : saveState === "saved" && !dirty ? "All changes saved" : dirty ? "Unsaved changes" : ""}
              </span>
            </div>
            <div className={a.formGrid}>
              <div className={s.field}>
                <label htmlFor="agent-name">Agent name</label>
                <div className={s.control}><input id="agent-name" value={agent.name} onChange={(event) => updateAgent("name", event.target.value)} /></div>
              </div>
              <div className={s.field}>
                <label htmlFor="agent-languages">Languages</label>
                <div className={s.control}><input id="agent-languages" value={agent.languages} onChange={(event) => updateAgent("languages", event.target.value)} /></div>
              </div>
              <div className={s.field}>
                <label htmlFor="agent-voice">Voice</label>
                <div className={s.control}>
                  <select id="agent-voice" value={agent.voice} onChange={(event) => updateAgent("voice", event.target.value)}>
                    {voices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
                  </select>
                </div>
              </div>
              <div className={s.field}>
                <label htmlFor="agent-tone">Tone</label>
                <div className={s.control}><input id="agent-tone" value={agent.tone} onChange={(event) => updateAgent("tone", event.target.value)} /></div>
              </div>
              <div className={`${s.field} ${a.wide}`}>
                <label htmlFor="agent-goal">Primary goal</label>
                <div className={s.control}><textarea id="agent-goal" value={agent.primaryGoal} onChange={(event) => updateAgent("primaryGoal", event.target.value)} /></div>
              </div>
              <div className={`${s.field} ${a.wide}`}>
                <label htmlFor="agent-welcome">Welcome message</label>
                <div className={s.control}><textarea id="agent-welcome" value={agent.welcomeMessage} onChange={(event) => updateAgent("welcomeMessage", event.target.value)} /></div>
              </div>
            </div>

            {error && <p className={s.error} role="alert">{error}</p>}

            <div className={a.actions}>
              <button type="button" className={s.ghost} onClick={lock}>
                Lock agent
              </button>
              <button
                type="button"
                className={`${s.submit} ${a.saveButton}`}
                data-state={saveState}
                onClick={() => void saveAgent()}
                disabled={busy || (!dirty && saveState !== "idle")}
              >
                {saveState === "saving" ? (
                  <><span className={s.spinner} aria-hidden="true" />Saving…</>
                ) : saveState === "saved" && !dirty ? (
                  <><span className={s.submitCheck} aria-hidden="true"><CheckIcon /></span>Saved</>
                ) : (
                  "Save customisation"
                )}
              </button>
            </div>
            <audio ref={audioRef} autoPlay />
          </section>
        </div>
      )}
    </main>
  );
}
