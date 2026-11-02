"use client";

import Link from "next/link";
import BrandLogo from "../brand-logo";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import LivePreview, { ReadinessMeter, type PreviewConfig, type ReadinessItem } from "./live-preview";
import styles from "./studio.module.css";

type Blueprint = {
  id: string;
  name: string;
  businessName: string;
  agentType: string;
  primaryGoal: string;
  languages: string[];
  voice: string;
  tone: string;
  channels: string[];
  capabilities: string[];
  integrations: string[];
  welcomeMessage: string;
  summary: string;
  instructions: string;
  guardrails: string[];
  generatedBy: "ai" | "safe-template";
  accessKey: string;
};

type PhoneNumber = { id?: string; number?: string; provider?: string };
type PhoneState =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: string }
  | { kind: "ready"; numbers: PhoneNumber[] };
type PublishState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; number: string }
  | { kind: "error"; message: string };

const agentTypes = [
  ["rule-based", "Rule-based", "Fixed menus, scripts and predictable paths"],
  ["ai-assisted", "AI-assisted", "Rules plus flexible AI explanations"],
  ["conversational", "Conversational AI", "Natural, interruption-friendly dialogue"],
  ["task-oriented", "Task-oriented", "Completes defined workflows with tools"],
  ["multilingual-multimodal", "Multilingual / multimodal", "Voice, text and several languages"],
  ["embodied", "Embodied", "A voice brain prepared for an avatar or device"],
  ["hybrid", "Hybrid", "Combines rules, conversation and task execution"],
];

const voices = [
  ["marin", "Marin", "Warm · balanced"],
  ["cedar", "Cedar", "Grounded · confident"],
  ["coral", "Coral", "Bright · welcoming"],
  ["alloy", "Alloy", "Neutral · clear"],
  ["ash", "Ash", "Calm · direct"],
  ["ballad", "Ballad", "Expressive · smooth"],
  ["echo", "Echo", "Friendly · energetic"],
  ["sage", "Sage", "Measured · thoughtful"],
  ["shimmer", "Shimmer", "Light · upbeat"],
  ["verse", "Verse", "Natural · modern"],
];

const capabilityOptions = [
  "Receptionist and call routing",
  "Explain topics and services",
  "Answer business FAQs",
  "Lead qualification",
  "Appointment requests",
  "Customer support",
  "Order or booking status",
  "Human handoff",
  "Live translation",
  "Knowledge-base search",
];

const integrationOptions = ["Calendar", "CRM", "WhatsApp", "Email", "Twilio / SIP", "Payments"];
const channelOptions = ["Website", "Phone", "WhatsApp", "Mobile app", "Avatar / kiosk"];
const languagePresets = ["English", "Telugu", "Hindi", "Tamil", "Kannada", "Urdu"];
const tonePresets = [
  "Warm, professional and concise",
  "Friendly and energetic",
  "Formal and precise",
  "Calm and reassuring",
];

const steps = [
  { number: 1, title: "Business", detail: "Who the agent represents" },
  { number: 2, title: "Behaviour", detail: "Type, language and voice" },
  { number: 3, title: "Actions", detail: "Capabilities and systems" },
  { number: 4, title: "Blueprint", detail: "Review and download" },
] as const;

function ToggleList({
  options,
  values,
  onChange,
  label,
}: {
  options: string[];
  values: string[];
  onChange: (next: string[]) => void;
  label: string;
}) {
  return (
    <div className={styles.toggleList} role="group" aria-label={label}>
      {options.map((option) => {
        const active = values.includes(option);
        return (
          <button
            className={styles.toggle}
            aria-pressed={active}
            key={option}
            onClick={() =>
              onChange(active ? values.filter((item) => item !== option) : [...values, option])
            }
            type="button"
          >
            <span className={styles.toggleMark} aria-hidden="true">
              <svg viewBox="0 0 12 12">
                {active ? <path d="M2.6 6.2 5 8.4 9.4 3.8" /> : <path d="M6 2.5v7M2.5 6h7" />}
              </svg>
            </span>
            {option}
          </button>
        );
      })}
    </div>
  );
}

export default function AgentStudio({ userName }: { userName: string }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [creationMode, setCreationMode] = useState<"direct" | "blueprint">("direct");
  const [phone, setPhone] = useState<PhoneState>({ kind: "loading" });
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [publish, setPublish] = useState<PublishState>({ kind: "idle" });
  const [copied, setCopied] = useState<"" | "id" | "key">("");
  const [languageDraft, setLanguageDraft] = useState("");
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [form, setForm] = useState({
    clientName: "",
    businessName: "",
    industry: "",
    agentType: "hybrid",
    primaryGoal: "",
    languages: ["English"],
    voice: "marin",
    tone: "Warm, professional and concise",
    channels: ["Website"],
    capabilities: ["Receptionist and call routing", "Explain topics and services", "Human handoff"],
    integrations: [] as string[],
    extraRequirements: "",
  });

  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const userNavigated = useRef(false);
  const copyTimer = useRef(0);

  const selectedVoice = useMemo(() => voices.find(([value]) => value === form.voice), [form.voice]);

  function update<Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function goTo(next: number) {
    if (next === step) return;
    if (next === 4 && !blueprint) return;
    setDirection(next > step ? "forward" : "back");
    userNavigated.current = true;
    setStep(next);
  }

  // Move focus to the new step's heading so keyboard and screen-reader users land in context.
  useEffect(() => {
    if (!userNavigated.current) return;
    headingRef.current?.focus({ preventScroll: true });
    const top = headingRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0 || top > window.innerHeight * 0.6) {
      headingRef.current?.closest("section")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [step]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const readiness: ReadinessItem[] = useMemo(
    () => [
      {
        id: "business",
        label: "Business name",
        detail: form.businessName.trim(),
        done: Boolean(form.businessName.trim()),
        required: true,
        step: 1,
      },
      {
        id: "goal",
        label: "Primary goal",
        detail: form.primaryGoal.trim(),
        done: Boolean(form.primaryGoal.trim()),
        required: true,
        step: 1,
      },
      {
        id: "languages",
        label: "Language",
        detail: form.languages.join(", "),
        done: form.languages.length > 0,
        required: false,
        step: 2,
      },
      {
        id: "voice",
        label: "Voice",
        detail: selectedVoice ? `${selectedVoice[1]} · ${selectedVoice[2]}` : "",
        done: Boolean(selectedVoice),
        required: false,
        step: 2,
      },
      {
        id: "capabilities",
        label: "Capability",
        detail: `${form.capabilities.length} selected`,
        done: form.capabilities.length > 0,
        required: false,
        step: 3,
      },
    ],
    [form.businessName, form.primaryGoal, form.languages, form.capabilities, selectedVoice],
  );
  const readyCount = readiness.filter((item) => item.done).length;
  const allReady = readyCount === readiness.length;
  const requiredReady = readiness.every((item) => !item.required || item.done);

  // On step 4 the preview shows what the server actually saved, not the form draft.
  const showCreated = step === 4 && blueprint !== null;
  const previewConfig: PreviewConfig = useMemo(() => {
    const source = showCreated && blueprint ? blueprint : form;
    const voice = voices.find(([value]) => value === source.voice);
    return {
      businessName: source.businessName,
      industry: form.industry,
      primaryGoal: source.primaryGoal,
      agentTypeLabel: agentTypes.find(([value]) => value === source.agentType)?.[1] || source.agentType,
      languages: source.languages,
      voice: source.voice,
      voiceLabel: voice?.[1] || source.voice,
      voiceDetail: voice?.[2] || "",
      tone: source.tone,
      channels: source.channels,
      capabilities: source.capabilities,
    };
  }, [form, blueprint, showCreated]);

  async function createAgent() {
    if (!form.businessName.trim() || !form.primaryGoal.trim()) {
      setError("Add the business name and the main goal first.");
      goTo(1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as {
        agent?: Omit<Blueprint, "accessKey">;
        credentials?: { agentId: string; accessKey: string };
        error?: string;
      };
      if (!response.ok || !data.agent || !data.credentials) {
        throw new Error(data.error || "Creation failed.");
      }
      setBlueprint({ ...data.agent, id: data.credentials.agentId, accessKey: data.credentials.accessKey });
      setPhone({ kind: "loading" });
      setPublish({ kind: "idle" });
      setDirection("forward");
      userNavigated.current = true;
      setStep(4);
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "The agent could not be created.");
    } finally {
      setBusy(false);
    }
  }

  function downloadBlueprint() {
    if (!blueprint) return;
    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${blueprint.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-blueprint.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyValue(kind: "id" | "key", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
    }
  }

  // Load the phone numbers available in the connected voice platform once an
  // agent exists, so the operator can put it on a real line in one step.
  useEffect(() => {
    if (step !== 4 || !blueprint) return;
    let active = true;
    fetch("/api/vapi/account")
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          connected?: boolean;
          phoneNumbers?: PhoneNumber[];
          error?: string;
        };
        if (!active) return;
        if (!response.ok || !data.connected) {
          setPhone({ kind: "unavailable", reason: data.error || "The phone platform is not connected." });
          return;
        }
        const numbers = data.phoneNumbers || [];
        setPhone({ kind: "ready", numbers });
        setPhoneNumberId((current) => current || numbers[0]?.id || "");
      })
      .catch(() => {
        if (active) setPhone({ kind: "unavailable", reason: "The phone platform could not be reached." });
      });
    return () => {
      active = false;
    };
  }, [step, blueprint]);

  async function publishToPhone() {
    if (!blueprint || !phoneNumberId) return;
    setPublish({ kind: "busy" });
    try {
      const response = await fetch("/api/vapi/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: blueprint.id, phoneNumberId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Publishing failed.");
      const chosen = phone.kind === "ready" ? phone.numbers.find((n) => n.id === phoneNumberId) : undefined;
      setPublish({ kind: "done", number: chosen?.number || "your number" });
    } catch (publishError) {
      setPublish({
        kind: "error",
        message: publishError instanceof Error ? publishError.message : "Publishing failed.",
      });
    }
  }

  async function signOut() {
    // A plain link to /login would leave the HttpOnly session cookie in place.
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    window.location.assign("/login");
  }

  function addLanguage() {
    const value = languageDraft.trim().replace(/\s+/g, " ");
    if (!value) return;
    const normalised = value.charAt(0).toUpperCase() + value.slice(1);
    if (!form.languages.some((language) => language.toLowerCase() === normalised.toLowerCase())) {
      update("languages", [...form.languages, normalised]);
    }
    setLanguageDraft("");
  }

  function onStepKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const enabled = steps.map((item) => item.number !== 4 || Boolean(blueprint));
    const move = (from: number, delta: number) => {
      let next = from;
      for (let i = 0; i < steps.length; i += 1) {
        next = (next + delta + steps.length) % steps.length;
        if (enabled[next]) return next;
      }
      return from;
    };
    let target = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") target = move(index, 1);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") target = move(index, -1);
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = enabled[3] ? 3 : 2;
    if (target >= 0) {
      event.preventDefault();
      stepButtons.current[target]?.focus();
    }
  }

  const languageOptions = [
    ...languagePresets,
    ...form.languages.filter((language) => !languagePresets.includes(language)),
  ];
  const progress = (step - 1) / (steps.length - 1);
  const finalAgent = showCreated && blueprint ? { name: blueprint.name, welcomeMessage: blueprint.welcomeMessage } : null;
  const enterClass = direction === "forward" ? styles.enterForward : styles.enterBack;

  return (
    <main className={styles.shell}>
      <nav className="nav studioNav">
        <BrandLogo />
        <div className="navRight"><span className={`signedInUser ${styles.navUser}`}>{userName}</span><button type="button" className="signOutButton" onClick={() => void signOut()}>Sign out</button><span className="navBadge">Agent Studio</span></div>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span className={styles.eyebrowDot} aria-hidden="true" />Agent creation workspace</p>
          <h1>Describe the job. <span>Hear the voice take shape.</span></h1>
          <p>Build receptionist, support, task, multilingual or embodied voice agents for any client — and watch the agent take shape in the live design view as you type.</p>
        </div>
        <fieldset className={styles.modes}>
          <legend>Creation mode</legend>
          {([
            ["direct", "Direct creation", "Create credentials and open a working personal agent."],
            ["blueprint", "Blueprint first", "Review the design before activating the personal agent."],
          ] as const).map(([value, title, detail]) => (
            <label key={value} className={styles.mode}>
              <input type="radio" name="creation-mode" value={value} checked={creationMode === value} onChange={() => setCreationMode(value)} />
              <span className={styles.modeRadio} aria-hidden="true" />
              <span className={styles.modeText}><strong>{title}</strong><small>{detail}</small></span>
            </label>
          ))}
        </fieldset>
      </header>

      <div className={styles.workspace}>
        <div className={styles.formColumn}>
          <nav className={styles.stepper} aria-label="Agent setup steps">
            <div className={styles.track} aria-hidden="true">
              <span className={styles.trackFill} style={{ transform: `scaleX(${progress})` }} />
            </div>
            <ol>
              {steps.map((item, index) => {
                const state = step === item.number ? "current" : item.number < step ? "done" : "todo";
                const locked = item.number === 4 && !blueprint;
                return (
                  <li key={item.number}>
                    <button
                      ref={(node) => { stepButtons.current[index] = node; }}
                      type="button"
                      className={styles.stepButton}
                      data-state={state}
                      aria-current={step === item.number ? "step" : undefined}
                      aria-disabled={locked || undefined}
                      title={locked ? "Available after the agent is created" : undefined}
                      onClick={() => goTo(item.number)}
                      onKeyDown={(event) => onStepKey(event, index)}
                    >
                      <span className={styles.stepDot} aria-hidden="true">
                        {state === "done" ? (
                          <svg viewBox="0 0 12 12"><path d="M2.6 6.2 5 8.4 9.4 3.8" /></svg>
                        ) : (
                          item.number
                        )}
                      </span>
                      <span className={styles.stepText}>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {step !== 4 && <ReadinessMeter items={readiness} onJump={goTo} />}

          <div className={styles.panel}>
            {step === 1 && (
              <section key="step-1" className={enterClass} aria-labelledby="step-title">
                <div className={styles.panelHead}><span>01 / 04</span><h2 id="step-title" ref={headingRef} tabIndex={-1}>Tell us about the client</h2><p>AgentX uses this foundation to shape the right agent.</p></div>
                <div className={styles.fieldGrid}>
                  <label className={styles.field}><span>Client name</span><input value={form.clientName} onChange={(e) => update("clientName", e.target.value)} placeholder="e.g. Dr Matla" autoComplete="off" /></label>
                  <label className={styles.field}><span>Business name <em>Required</em></span><input required value={form.businessName} onChange={(e) => update("businessName", e.target.value)} placeholder="e.g. Kensley Aesthetics" autoComplete="organization" /></label>
                  <label className={`${styles.field} ${styles.wide}`}><span>Industry</span><input value={form.industry} onChange={(e) => update("industry", e.target.value)} placeholder="e.g. Aesthetic clinic, veterinary hospital, e-commerce" autoComplete="off" /></label>
                  <label className={`${styles.field} ${styles.wide}`}><span>Main result this agent must achieve <em>Required</em></span><textarea required value={form.primaryGoal} onChange={(e) => update("primaryGoal", e.target.value)} placeholder="Answer patient questions, qualify enquiries and request appointments before handing complex cases to reception." /></label>
                </div>
                {error && <div className={styles.error} role="alert">{error}</div>}
                <div className={styles.actions}><span /><button className={styles.primary} type="button" onClick={() => goTo(2)}>Continue<span aria-hidden="true">→</span></button></div>
              </section>
            )}

            {step === 2 && (
              <section key="step-2" className={enterClass} aria-labelledby="step-title">
                <div className={styles.panelHead}><span>02 / 04</span><h2 id="step-title" ref={headingRef} tabIndex={-1}>Choose its intelligence and voice</h2><p>Mix predictable workflows with natural conversation.</p></div>
                <fieldset className={styles.group}>
                  <legend>Agent type</legend>
                  <div className={styles.typeGrid}>
                    {agentTypes.map(([value, title, detail]) => (
                      <label className={styles.option} key={value}>
                        <input type="radio" name="agent-type" value={value} checked={form.agentType === value} onChange={() => update("agentType", value)} />
                        <strong>{title}</strong><small>{detail}</small>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className={styles.group}>
                  <legend>Languages <small>First selected is the primary language</small></legend>
                  <ToggleList label="Languages" options={languageOptions} values={form.languages} onChange={(value) => update("languages", value)} />
                  <div className={styles.inlineAdd}>
                    <label className={styles.visuallyHidden} htmlFor="language-draft">Add another language</label>
                    <input id="language-draft" value={languageDraft} onChange={(e) => setLanguageDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLanguage(); } }} placeholder="Add another language, e.g. Marathi" autoComplete="off" />
                    <button type="button" className={styles.secondary} onClick={addLanguage} disabled={!languageDraft.trim()}>Add</button>
                  </div>
                </fieldset>

                <fieldset className={styles.group}>
                  <legend>Voice <small>Use “Hear the greeting” in the preview to listen</small></legend>
                  <div className={styles.voiceGrid}>
                    {voices.map(([value, name, detail]) => (
                      <label className={styles.option} key={value}>
                        <input type="radio" name="voice" value={value} checked={form.voice === value} onChange={() => update("voice", value)} />
                        <strong>{name}</strong><small>{detail}</small>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className={styles.group}>
                  <legend>Tone</legend>
                  <label className={styles.field}><span className={styles.visuallyHidden}>Tone</span><input value={form.tone} onChange={(e) => update("tone", e.target.value)} placeholder="Describe how the agent should sound" /></label>
                  <div className={styles.presetRow} role="group" aria-label="Tone presets">
                    {tonePresets.map((preset) => (
                      <button key={preset} type="button" className={styles.preset} aria-pressed={form.tone === preset} onClick={() => update("tone", preset)}>{preset}</button>
                    ))}
                  </div>
                </fieldset>

                {error && <div className={styles.error} role="alert">{error}</div>}
                <div className={styles.actions}><button className={styles.secondary} type="button" onClick={() => goTo(1)}><span aria-hidden="true">←</span>Back</button><button className={styles.primary} type="button" onClick={() => goTo(3)}>Continue<span aria-hidden="true">→</span></button></div>
              </section>
            )}

            {step === 3 && (
              <section key="step-3" className={enterClass} aria-labelledby="step-title">
                <div className={styles.panelHead}><span>03 / 04</span><h2 id="step-title" ref={headingRef} tabIndex={-1}>Define what it can do</h2><p>Select real capabilities. Connections are activated only after account setup.</p></div>
                <fieldset className={styles.group}>
                  <legend>Capabilities</legend>
                  <ToggleList label="Capabilities" options={capabilityOptions} values={form.capabilities} onChange={(value) => update("capabilities", value)} />
                </fieldset>
                <fieldset className={styles.group}>
                  <legend>Channels</legend>
                  <ToggleList label="Channels" options={channelOptions} values={form.channels} onChange={(value) => update("channels", value)} />
                </fieldset>
                <fieldset className={styles.group}>
                  <legend>Future integrations <small>Not active until each account is connected</small></legend>
                  <ToggleList label="Future integrations" options={integrationOptions} values={form.integrations} onChange={(value) => update("integrations", value)} />
                </fieldset>
                <label className={`${styles.field} ${styles.group}`}><span>Extra rules or requirements</span><textarea value={form.extraRequirements} onChange={(e) => update("extraRequirements", e.target.value)} placeholder="Example: Never give medical advice. Always ask for consent before saving contact details." /></label>
                {error && <div className={styles.error} role="alert">{error}</div>}
                <div className={styles.actions}>
                  <button className={styles.secondary} type="button" onClick={() => goTo(2)}><span aria-hidden="true">←</span>Back</button>
                  <div className={styles.createWrap}>
                    <span className={styles.createHint} data-ready={requiredReady ? "true" : "false"} aria-live="polite">
                      {allReady ? "All checks complete" : requiredReady ? `${readyCount} of ${readiness.length} checks complete` : "Add business name and goal to create"}
                    </span>
                    <button className={styles.primary} data-ready={requiredReady ? "true" : "false"} type="button" onClick={() => void createAgent()} disabled={busy} aria-busy={busy}>
                      {busy && <span className={styles.spinner} aria-hidden="true" />}
                      {busy ? "Creating agent…" : "Create voice agent"}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {step === 4 && blueprint && (
              <section key="step-4" className={`${enterClass} ${styles.blueprint}`} aria-labelledby="step-title">
                <div className={styles.successHead}>
                  <span className={styles.successMark} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5 10 16.5 18 8" /></svg></span>
                  <div>
                    <p className={styles.eyebrow}>{creationMode === "direct" ? "Personal agent created" : "Blueprint created"}</p>
                    <h2 id="step-title" ref={headingRef} tabIndex={-1}>{blueprint.name}</h2>
                  </div>
                </div>
                <p className={styles.summary}>{blueprint.summary}</p>
                <dl className={styles.meta}>
                  <div><dt>Type</dt><dd>{blueprint.agentType}</dd></div>
                  <div><dt>Voice</dt><dd>{blueprint.voice}</dd></div>
                  <div><dt>Languages</dt><dd>{blueprint.languages.join(", ")}</dd></div>
                  <div><dt>Creation engine</dt><dd>{blueprint.generatedBy === "ai" ? "AgentX Intelligence" : "AgentX Safe Mode"}</dd></div>
                </dl>
                <div className={styles.welcome}><span>First spoken message</span><p>“{blueprint.welcomeMessage}”</p></div>

                <div className={styles.credentials}>
                  <div className={styles.cardHead}><span>Private AgentX credentials</span><strong>Save these now. The access key is shown only once.</strong></div>
                  <div className={styles.credentialRow}><span>Agent ID</span><code>{blueprint.id}</code><button type="button" data-copied={copied === "id" ? "true" : "false"} onClick={() => void copyValue("id", blueprint.id)}>{copied === "id" ? "Copied" : "Copy"}</button></div>
                  <div className={styles.credentialRow}><span>Access key</span><code>{blueprint.accessKey}</code><button type="button" data-copied={copied === "key" ? "true" : "false"} onClick={() => void copyValue("key", blueprint.accessKey)}>{copied === "key" ? "Copied" : "Copy"}</button></div>
                  <span className={styles.visuallyHidden} role="status">{copied ? "Copied to clipboard" : ""}</span>
                  <Link className={styles.textLink} href="/access">Open secure agent access →</Link>
                </div>

                <div className={styles.guardrails}><h3>Built-in safety rules</h3><ul>{blueprint.guardrails.map((rule) => <li key={rule}><i aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2.6 6.2 5 8.4 9.4 3.8" /></svg></i>{rule}</li>)}</ul></div>

                <div className={styles.phoneCard}>
                  <div className={styles.cardHead}>
                    <span>Phone line</span>
                    <strong>Put this agent on a real phone number</strong>
                  </div>
                  {phone.kind === "loading" && <p className={styles.muted}><span className={styles.spinner} aria-hidden="true" />Checking your phone numbers…</p>}
                  {phone.kind === "unavailable" && <p className={styles.muted}>{phone.reason}</p>}
                  {phone.kind === "ready" && phone.numbers.length === 0 && (
                    <p className={styles.muted}>No phone numbers yet. Add one in your voice platform, then reload this page.</p>
                  )}
                  {phone.kind === "ready" && phone.numbers.length > 0 && publish.kind !== "done" && (
                    <div className={styles.phoneRow}>
                      <label className={styles.field}>
                        <span>Number</span>
                        <select value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} disabled={publish.kind === "busy"}>
                          {phone.numbers.map((n) => (
                            <option key={n.id} value={n.id}>{n.number || n.id}</option>
                          ))}
                        </select>
                      </label>
                      <button className={styles.primary} type="button" onClick={() => void publishToPhone()} disabled={publish.kind === "busy" || !phoneNumberId}>
                        {publish.kind === "busy" ? "Publishing…" : "Publish to phone"}
                      </button>
                    </div>
                  )}
                  {publish.kind === "error" && <p className={styles.error} role="alert">{publish.message}</p>}
                  {publish.kind === "done" && (
                    <p className={styles.notice} role="status">
                      Live. Call <strong>{publish.number}</strong> — leads, appointments and handoffs from the call appear in Operations.
                    </p>
                  )}
                </div>
                <div className={styles.launchNote}><strong>{creationMode === "direct" ? "Personal AgentX ready" : "Blueprint ready for review"}</strong><p>Use the credentials to open and speak with this agent in the browser, or publish it to a phone line above. Calendar, CRM, WhatsApp, email and payments still require separate account connections.</p></div>
                <div className={styles.actions}>
                  <button className={styles.secondary} type="button" onClick={() => { setBlueprint(null); setCopied(""); goTo(1); }}>Create another</button>
                  <button className={styles.primary} type="button" onClick={downloadBlueprint}>Download JSON<span aria-hidden="true">↓</span></button>
                </div>
              </section>
            )}
          </div>
        </div>

        <aside className={styles.previewColumn} aria-label="Live design view">
          <div className={styles.previewHead}>
            <span className={styles.previewTitle}><i aria-hidden="true" />Live design view</span>
            <span className={styles.previewSub}>{finalAgent ? "Showing the created agent" : "Updates as you type"}</span>
          </div>
          <LivePreview
            config={previewConfig}
            finalAgent={finalAgent}
            status={finalAgent ? "created" : allReady ? "ready" : "draft"}
          />
        </aside>
      </div>
    </main>
  );
}
