"use client";

import Link from "next/link";
import BrandLogo from "../brand-logo";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import s from "./auth.module.css";

type Mode = "email" | "phone";
type Phase = "idle" | "success";

const errorMessages: Record<string, string> = {
  unconfigured: "Sign-in is not configured yet. Add your identity provider settings.",
  denied: "Sign-in was cancelled.",
  expired: "That sign-in link expired. Please try again.",
  exchange: "Could not complete sign-in. Please try again.",
  provider: "That sign-in method is not available.",
};

type Providers = { email: boolean; google: boolean; phone: boolean; signup: boolean; confirmEmail: boolean };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const RESEND_SECONDS = 30;

function emailProblem(value: string) {
  if (!value.trim()) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(value.trim())) return "That doesn't look like an email address. Check for a typo.";
  return "";
}
function passwordProblem(value: string) {
  if (!value) return "Enter your password.";
  if (value.length < MIN_PASSWORD) return `Passwords are at least ${MIN_PASSWORD} characters.`;
  return "";
}
function phoneProblem(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!value.trim()) return "Enter your mobile number.";
  if (!value.trim().startsWith("+") || digits.length < 10 || digits.length > 15) {
    return "Use international format, for example +91 98765 43210.";
  }
  return "";
}
function codeProblem(value: string) {
  return /^\d{6}$/.test(value) ? "" : "Enter the 6-digit code from the SMS.";
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("email");
  // Assume email only until the identity provider confirms more, so a button
  // for a disabled method never flashes up and dead-ends.
  const [providers, setProviders] = useState<Providers>({
    email: true,
    google: false,
    phone: false,
    signup: true,
    confirmEmail: false,
  });

  useEffect(() => {
    let active = true;
    fetch("/api/auth/providers")
      .then((response) => (response.ok ? (response.json() as Promise<Providers>) : null))
      .then((data) => {
        if (active && data) setProviders(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") return "";
    const reason = new URLSearchParams(window.location.search).get("error");
    return reason ? errorMessages[reason] || "Sign-in failed. Please try again." : "";
  });

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const redirectTimer = useRef<number | undefined>(undefined);

  // Count down before another code can be requested. Cleared on unmount.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => () => window.clearTimeout(redirectTimer.current), []);

  const emailError = emailProblem(email);
  const passwordError = passwordProblem(password);
  const phoneError = phoneProblem(phone);
  const codeError = codeProblem(code);
  const show = (field: string, problem: string) => (touched[field] ? problem : "");

  function touch(...fields: string[]) {
    setTouched((current) => {
      const next = { ...current };
      for (const field of fields) next[field] = true;
      return next;
    });
  }

  function returnTo() {
    if (typeof window === "undefined") return "/studio";
    const value = new URLSearchParams(window.location.search).get("return_to");
    return value && value.startsWith("/") && !value.startsWith("//") ? value : "/studio";
  }

  async function post(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      sent?: boolean;
      confirmationRequired?: boolean;
    };
    if (!response.ok) {
      if (/confirm your email/i.test(data.error || "")) setNeedsConfirm(true);
      throw new Error(data.error || "Something went wrong. Please try again.");
    }
    return data;
  }

  /** Shows a brief confirmation, then leaves. Buttons stay disabled meanwhile. */
  function finishSignIn() {
    setPhase("success");
    const destination = returnTo();
    redirectTimer.current = window.setTimeout(
      () => window.location.assign(destination),
      reducedMotion() ? 250 : 650,
    );
    return "redirect" as const;
  }

  async function run(label: string, action: () => Promise<"redirect" | void>) {
    setBusy(true);
    setBusyLabel(label);
    setError("");
    setNotice("");
    let leaving = false;
    try {
      leaving = (await action()) === "redirect";
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Something went wrong.");
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  function validEmailForm() {
    touch("email", "password");
    if (emailError) {
      emailRef.current?.focus();
      return false;
    }
    if (passwordError) {
      passwordRef.current?.focus();
      return false;
    }
    return true;
  }

  const submitEmail = (action: "signin" | "signup") => {
    if (!validEmailForm()) return;
    void run(action === "signup" ? "Creating account…" : "Signing in…", async () => {
      const data = await post("/api/auth/password", { email: email.trim(), password, action });
      if (data.confirmationRequired) {
        setNotice(`Check ${email.trim()} for a confirmation link, then sign in.`);
        return;
      }
      return finishSignIn();
    });
  };

  const submitPhone = () => {
    touch("phone", ...(codeSent ? ["code"] : []));
    if (phoneError) {
      phoneRef.current?.focus();
      return;
    }
    if (codeSent && codeError) {
      codeRef.current?.focus();
      return;
    }
    void run(codeSent ? "Verifying…" : "Sending code…", async () => {
      if (!codeSent) {
        await post("/api/auth/otp", { phone: phone.trim() });
        setCodeSent(true);
        setResendIn(RESEND_SECONDS);
        setNotice(`We sent a 6-digit code to ${phone.trim()}.`);
        window.setTimeout(() => codeRef.current?.focus(), 0);
        return;
      }
      await post("/api/auth/otp", { phone: phone.trim(), code });
      return finishSignIn();
    });
  };

  const resendCode = () =>
    void run("Sending code…", async () => {
      await post("/api/auth/otp", { phone: phone.trim() });
      setResendIn(RESEND_SECONDS);
      setNotice(`A new code is on its way to ${phone.trim()}.`);
    });

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: Mode = mode === "email" ? "phone" : "email";
    switchMode(next);
    tabRefs.current[next === "email" ? 0 : 1]?.focus();
  }

  const succeeded = phase === "success";
  const showEmailForm = mode === "email" || !providers.phone;

  return (
    <main className={s.shell}>
      <nav className="nav studioNav">
        <BrandLogo />
        <div className={`navRight ${s.navLinks}`}>
          <Link href="/pricing">Pricing</Link>
          <Link href="/access">Agent credentials</Link>
        </div>
      </nav>

      <div className={s.stage}>
        <aside className={s.intro}>
          <p className={s.eyebrow}><span className={s.eyebrowDot} aria-hidden="true" />Creator account</p>
          <h1>Welcome back to AgentX.</h1>
          <p className={s.lede}>Sign in to build voice agents, publish them to a phone number and follow up on every lead they capture.</p>
          <ul className={s.facts}>
            <li><span className={s.factIcon} aria-hidden="true"><CheckIcon /></span>Agents, leads and transcripts are tied to your account.</li>
            <li><span className={s.factIcon} aria-hidden="true"><CheckIcon /></span>Publish an agent to a phone number and place calls through Vapi.</li>
            <li><span className={s.factIcon} aria-hidden="true"><CheckIcon /></span>Call minutes are recorded per call, rounded up.</li>
          </ul>
        </aside>

        <section className={s.card} data-phase={phase} aria-labelledby="login-title">
          <span className={s.progress} aria-hidden="true" />
          <header className={s.cardHead}>
            <h2 id="login-title">{succeeded ? "You're in." : "Sign in"}</h2>
            <p>
              {succeeded
                ? "Opening your workspace…"
                : showEmailForm
                  ? "Use the email you signed up with."
                  : "We'll text a one-time code to your mobile."}
            </p>
          </header>

          {providers.google && (
            <>
              <a
                className={s.oauth}
                href={`/api/auth/authorize?provider=google&return_to=${encodeURIComponent(returnTo())}`}
              >
                <span className={s.oauthMark} aria-hidden="true">G</span>Continue with Google
              </a>
              <div className={s.divider}><span>or</span></div>
            </>
          )}

          {providers.phone && (
          <div
            className={s.tabs}
            role="tablist"
            aria-label="Sign-in method"
            data-mode={mode}
            onKeyDown={onTabKey}
          >
            <span className={s.tabThumb} aria-hidden="true" />
            <button
              ref={(node) => { tabRefs.current[0] = node; }}
              type="button"
              role="tab"
              id="tab-email"
              aria-selected={mode === "email"}
              aria-controls="panel-signin"
              tabIndex={mode === "email" ? 0 : -1}
              onClick={() => switchMode("email")}
            >
              Email
            </button>
            <button
              ref={(node) => { tabRefs.current[1] = node; }}
              type="button"
              role="tab"
              id="tab-phone"
              aria-selected={mode === "phone"}
              aria-controls="panel-signin"
              tabIndex={mode === "phone" ? 0 : -1}
              onClick={() => switchMode("phone")}
            >
              Mobile OTP
            </button>
          </div>
          )}

          {showEmailForm ? (
            <form
              id="panel-signin"
              key="email"
              className={s.form}
              noValidate
              role={providers.phone ? "tabpanel" : undefined}
              aria-labelledby={providers.phone ? "tab-email" : undefined}
              onSubmit={(submitEvent) => { submitEvent.preventDefault(); submitEmail("signin"); }}
            >
              <div className={s.field} data-invalid={show("email", emailError) ? "true" : undefined}>
                <label htmlFor="login-email">Email address</label>
                <div className={s.control}>
                  <input
                    ref={emailRef}
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(changeEvent) => setEmail(changeEvent.target.value)}
                    onBlur={() => email && touch("email")}
                    aria-invalid={Boolean(show("email", emailError))}
                    aria-describedby={show("email", emailError) ? "login-email-error" : undefined}
                    required
                  />
                  <span className={s.validMark} data-on={!emailError ? "true" : undefined} aria-hidden="true"><CheckIcon /></span>
                </div>
                {show("email", emailError) && <p className={s.fieldError} id="login-email-error">{emailError}</p>}
              </div>

              <div className={s.field} data-invalid={show("password", passwordError) ? "true" : undefined}>
                <label htmlFor="login-password">Password</label>
                <div className={s.control}>
                  <input
                    ref={passwordRef}
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(changeEvent) => setPassword(changeEvent.target.value)}
                    onBlur={() => password && touch("password")}
                    aria-invalid={Boolean(show("password", passwordError))}
                    aria-describedby="login-password-hint"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    className={s.reveal}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    aria-controls="login-password"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
                <p
                  id="login-password-hint"
                  className={show("password", passwordError) ? s.fieldError : s.hint}
                  data-met={password.length >= MIN_PASSWORD ? "true" : undefined}
                >
                  {show("password", passwordError) || (
                    <>
                      <span className={s.hintCheck} aria-hidden="true"><CheckIcon /></span>
                      At least {MIN_PASSWORD} characters
                      <span className={s.counter} aria-hidden="true">{Math.min(password.length, 99)}/{MIN_PASSWORD}</span>
                    </>
                  )}
                </p>
              </div>

              <button className={s.submit} type="submit" disabled={busy} data-phase={phase}>
                {succeeded ? (
                  <><span className={s.submitCheck} aria-hidden="true"><CheckIcon /></span>Signed in</>
                ) : busy ? (
                  <><span className={s.spinner} aria-hidden="true" />{busyLabel}</>
                ) : (
                  "Continue with email"
                )}
              </button>
              {providers.signup && (
                <p className={s.alt}>
                  New to AgentX?{" "}
                  <button
                    type="button"
                    className={s.linkButton}
                    disabled={busy}
                    onClick={() => submitEmail("signup")}
                  >
                    Create an account instead
                  </button>
                </p>
              )}
            </form>
          ) : (
            <form
              id="panel-signin"
              key="phone"
              className={s.form}
              noValidate
              role="tabpanel"
              aria-labelledby="tab-phone"
              onSubmit={(submitEvent) => { submitEvent.preventDefault(); submitPhone(); }}
            >
              <div className={s.field} data-invalid={show("phone", phoneError) ? "true" : undefined}>
                <label htmlFor="login-phone">Mobile number</label>
                <div className={s.control}>
                  <input
                    ref={phoneRef}
                    id="login-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    readOnly={codeSent}
                    onChange={(changeEvent) => setPhone(changeEvent.target.value)}
                    onBlur={() => phone && touch("phone")}
                    aria-invalid={Boolean(show("phone", phoneError))}
                    aria-describedby={show("phone", phoneError) ? "login-phone-error" : undefined}
                    required
                  />
                  <span className={s.validMark} data-on={!phoneError ? "true" : undefined} aria-hidden="true"><CheckIcon /></span>
                </div>
                {show("phone", phoneError) && <p className={s.fieldError} id="login-phone-error">{phoneError}</p>}
              </div>
              {codeSent && (
                <div className={`${s.field} ${s.reveals}`} data-invalid={show("code", codeError) ? "true" : undefined}>
                  <label htmlFor="login-code">Verification code</label>
                  <div className={s.control}>
                    <input
                      ref={codeRef}
                      id="login-code"
                      className={s.codeInput}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="••••••"
                      maxLength={6}
                      value={code}
                      onChange={(changeEvent) => setCode(changeEvent.target.value.replace(/\D/g, "").slice(0, 6))}
                      onBlur={() => code && touch("code")}
                      aria-invalid={Boolean(show("code", codeError))}
                      aria-describedby={show("code", codeError) ? "login-code-error" : undefined}
                      required
                    />
                  </div>
                  {show("code", codeError) && <p className={s.fieldError} id="login-code-error">{codeError}</p>}
                </div>
              )}
              <button className={s.submit} type="submit" disabled={busy} data-phase={phase}>
                {succeeded ? (
                  <><span className={s.submitCheck} aria-hidden="true"><CheckIcon /></span>Verified</>
                ) : busy ? (
                  <><span className={s.spinner} aria-hidden="true" />{busyLabel}</>
                ) : codeSent ? (
                  "Verify and continue"
                ) : (
                  "Send OTP"
                )}
              </button>
              {codeSent && (
                <div className={s.altRow}>
                  <button
                    type="button"
                    className={s.linkButton}
                    disabled={busy}
                    onClick={() => { setCodeSent(false); setCode(""); setNotice(""); setResendIn(0); }}
                  >
                    Use a different number
                  </button>
                  <button
                    type="button"
                    className={s.linkButton}
                    disabled={busy || resendIn > 0}
                    onClick={resendCode}
                  >
                    {resendIn > 0 ? (
                      <>Resend in <span className={s.tabular}>0:{String(resendIn).padStart(2, "0")}</span></>
                    ) : (
                      "Resend code"
                    )}
                  </button>
                </div>
              )}
            </form>
          )}

          {error && <p className={s.error} role="alert">{error}</p>}
          {needsConfirm && (
            <div className={s.confirmRow}>
              <button
                type="button"
                className={s.secondary}
                disabled={busy || !email}
                onClick={() =>
                  void run("Sending…", async () => {
                    await post("/api/auth/resend", { email: email.trim() });
                    setNeedsConfirm(false);
                    setNotice(`Confirmation email sent to ${email.trim()}. Open the link, then sign in.`);
                  })
                }
              >
                {busy ? "Sending…" : "Resend confirmation email"}
              </button>
            </div>
          )}
          {error && providers.confirmEmail && (
            <p className={s.muted}>
              Just signed up? This site requires email confirmation, and an account
              stays unusable until the emailed link is opened — which looks exactly
              like a wrong password.
            </p>
          )}
          {notice && <p className={s.notice} role="status">{notice}</p>}

          <p className={s.srOnly} role="status">{succeeded ? "Signed in. Redirecting." : ""}</p>
          <small className={s.footnote}>Your session is stored in a secure, HTTP-only cookie.</small>
        </section>
      </div>
    </main>
  );
}
