"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import BrandLogo from "../brand-logo";
import s from "./pricing.module.css";

type Billing = "monthly" | "annual";
type Feature = { label: string; planned?: boolean };
type Plan = {
  id: "starter" | "professional" | "agency";
  name: string;
  price: number;
  minutes: number;
  description: string;
  features: Feature[];
  featured?: boolean;
};

const ANNUAL_DISCOUNT = 0.2;

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 1499,
    minutes: 100,
    description: "One voice assistant for a single business.",
    features: [
      { label: "1 active agent" },
      { label: "100 call minutes / month" },
      { label: "2 languages" },
      { label: "Browser voice sessions" },
      { label: "Private agent credentials" },
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 4999,
    minutes: 500,
    description: "For teams that answer and place phone calls.",
    features: [
      { label: "5 active agents" },
      { label: "500 call minutes / month" },
      { label: "10 languages" },
      { label: "Inbound & outbound phone calls" },
      { label: "Lead, booking & handoff capture" },
      { label: "CRM & calendar connectors", planned: true },
    ],
    featured: true,
  },
  {
    id: "agency",
    name: "Agency",
    price: 14999,
    minutes: 2500,
    description: "For agencies building agents for clients.",
    features: [
      { label: "25 active agents" },
      { label: "2,500 call minutes / month" },
      { label: "All supported languages" },
      { label: "Client credential management" },
      { label: "White-label installation", planned: true },
    ],
  },
];

const inr = (value: number) => value.toLocaleString("en-IN");
const monthlyPrice = (plan: Plan, billing: Billing) =>
  billing === "annual" ? Math.round(plan.price * (1 - ANNUAL_DISCOUNT)) : plan.price;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Morphs a number toward `value` with requestAnimationFrame, writing straight
 * to the DOM so a price change never re-renders the page 60 times a second.
 * The loop is cancelled on unmount and skipped while the tab is hidden.
 */
function AnimatedNumber({ value, format = inr, duration = 420 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const frame = useRef(0);
  // React renders the first value once; later values are painted by the loop.
  const [initial] = useState(() => format(value));

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = shown.current;
    const to = value;
    cancelAnimationFrame(frame.current);

    const settle = () => {
      cancelAnimationFrame(frame.current);
      shown.current = to;
      node.textContent = format(to);
    };
    if (from === to || prefersReducedMotion() || document.visibilityState === "hidden") {
      settle();
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (to - from) * eased);
      shown.current = current;
      node.textContent = format(current);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") settle();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(frame.current);
    };
  }, [value, format, duration]);

  return <span ref={ref} aria-hidden="true">{initial}</span>;
}

function trackSpotlight(event: PointerEvent<HTMLElement>) {
  // Per-pointer values go to CSS variables, not React state.
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  card.style.setProperty("--my", `${event.clientY - rect.top}px`);
}

const dayOptions = [22, 26, 30] as const;

export default function PricingPage() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const [message, setMessage] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [pending, setPending] = useState<Plan["id"] | "">("");
  const [callsPerDay, setCallsPerDay] = useState(5);
  const [avgMinutes, setAvgMinutes] = useState(2.5);
  const [daysOpen, setDaysOpen] = useState<(typeof dayOptions)[number]>(26);
  const toggleRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  // Calls bill in whole minutes: a 2m 30s call is recorded as 3.
  const billablePerCall = Math.ceil(avgMinutes);
  const monthlyMinutes = callsPerDay * billablePerCall * daysOpen;
  const recommended = plans.find((plan) => plan.minutes >= monthlyMinutes) || null;
  const meterPlan = recommended || plans[plans.length - 1];
  const meterFill = Math.min(100, (monthlyMinutes / meterPlan.minutes) * 100);

  async function subscribe(plan: Plan["id"]) {
    setMessage("");
    setNeedsLogin(false);
    setPending(plan);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, billing }),
      });
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setNeedsLogin(response.status === 401);
      setMessage(data.error || "Billing setup is not connected yet.");
    } catch {
      setMessage("Could not reach billing. Check your connection and try again.");
    }
    setPending("");
  }

  function onToggleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: Billing =
      event.key === "Home" ? "monthly" : event.key === "End" ? "annual" : billing === "monthly" ? "annual" : "monthly";
    setBilling(next);
    toggleRefs.current[next === "monthly" ? 0 : 1]?.focus();
  }

  function showPlan(id: Plan["id"]) {
    const card = cardRefs.current[id];
    if (!card) return;
    card.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    card.focus({ preventScroll: true });
  }

  return (
    <main className={s.shell}>
      <nav className="nav studioNav">
        <BrandLogo />
        <div className={`navRight ${s.navLinks}`}>
          <Link href="/platform">Platform</Link>
          <Link href="/login">Login</Link>
          <span className="navBadge">INR plans</span>
        </div>
      </nav>

      <header className={s.hero}>
        <p className={s.eyebrow}><span className={s.eyebrowDot} aria-hidden="true" />Pricing in Indian rupees</p>
        <h1>
          Pay for the calls
          <br />
          <span>your business takes.</span>
        </h1>
        <p className={s.lede}>
          Three plans, sized by agents and call minutes. Every plan includes private agent credentials and
          per-call usage records.
        </p>

        <div
          className={s.toggle}
          role="radiogroup"
          aria-label="Billing period"
          data-billing={billing}
          onKeyDown={onToggleKey}
        >
          <span className={s.toggleThumb} aria-hidden="true" />
          {(["monthly", "annual"] as const).map((option, index) => (
            <button
              key={option}
              ref={(node) => { toggleRefs.current[index] = node; }}
              type="button"
              role="radio"
              aria-checked={billing === option}
              tabIndex={billing === option ? 0 : -1}
              onClick={() => setBilling(option)}
            >
              {option === "monthly" ? "Monthly" : "Annual"}
              {option === "annual" && <span className={s.save}>−20%</span>}
            </button>
          ))}
        </div>
      </header>

      <section className={s.grid} aria-label="Plans">
        {plans.map((plan, index) => {
          const amount = monthlyPrice(plan, billing);
          const yearly = amount * 12;
          const saving = plan.price * 12 - yearly;
          const isMatch = recommended?.id === plan.id;
          return (
            <article
              key={plan.id}
              ref={(node) => { cardRefs.current[plan.id] = node; }}
              className={s.card}
              data-featured={plan.featured ? "true" : undefined}
              data-match={isMatch ? "true" : undefined}
              tabIndex={-1}
              aria-labelledby={`plan-${plan.id}`}
              onPointerMove={trackSpotlight}
              style={{ "--i": index } as CSSProperties}
            >
              <span className={s.spotlight} aria-hidden="true" />
              {plan.featured && <span className={s.featuredTag}>Recommended</span>}
              <div className={s.cardTop}>
                <h2 id={`plan-${plan.id}`}>{plan.name}</h2>
                {isMatch && <span className={s.matchTag}>Fits your estimate</span>}
              </div>
              <p className={s.description}>{plan.description}</p>

              <div className={s.price}>
                <span className={s.currency}>₹</span>
                <strong className={s.amount}>
                  <AnimatedNumber value={amount} />
                </strong>
                <span className={s.per}>/ month</span>
                <span className={s.srOnly}>₹{inr(amount)} per month</span>
              </div>
              <p className={s.billingNote} key={billing}>
                {billing === "annual" ? (
                  <>
                    ₹{inr(yearly)} billed yearly · <span className={s.saveText}>save ₹{inr(saving)}</span>
                  </>
                ) : (
                  "Billed monthly"
                )}
              </p>

              <ul className={s.features}>
                {plan.features.map((feature) => (
                  <li key={feature.label} data-planned={feature.planned ? "true" : undefined}>
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      {feature.planned ? <circle cx="8" cy="8" r="2.5" /> : <path d="M3.5 8.5l3 3 6-7" />}
                    </svg>
                    <span>{feature.label}</span>
                    {feature.planned && <span className={s.plannedTag}>Planned</span>}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={s.choose}
                disabled={pending !== ""}
                aria-busy={pending === plan.id}
                onClick={() => void subscribe(plan.id)}
              >
                {pending === plan.id ? (
                  <>
                    <span className={s.spinner} aria-hidden="true" />
                    Opening checkout…
                  </>
                ) : (
                  <>Choose {plan.name}</>
                )}
              </button>
            </article>
          );
        })}
      </section>

      <p className={s.message} role="status" data-visible={message ? "true" : undefined}>
        {message}
        {needsLogin && (
          <>
            {" "}
            <Link className={s.messageLink} href="/login?return_to=/pricing">Sign in</Link>
          </>
        )}
      </p>

      <p className={s.footnote}>
        Items marked <span className={s.plannedInline}>Planned</span> are not built yet. Plan
        allowances are not enforced automatically yet; call minutes are recorded per call.
      </p>

      <section className={s.estimator} aria-labelledby="estimator-title">
        <div className={s.estimatorControls}>
          <p className={s.eyebrow}><span className={s.eyebrowDot} aria-hidden="true" />Estimator</p>
          <h2 id="estimator-title">How many call minutes do you need?</h2>
          <p className={s.estimatorLede}>
            Move the sliders to match a normal month. We&apos;ll suggest the smallest plan that covers it.
          </p>

          <div className={s.field}>
            <div className={s.fieldHead}>
              <label htmlFor="calls-per-day">Calls per day</label>
              <output htmlFor="calls-per-day" className={s.fieldValue}>{callsPerDay}</output>
            </div>
            <input
              id="calls-per-day"
              className={s.range}
              type="range"
              min={1}
              max={120}
              step={1}
              value={callsPerDay}
              onChange={(event) => setCallsPerDay(Number(event.target.value))}
              style={{ "--fill": `${((callsPerDay - 1) / 119) * 100}%` } as CSSProperties}
            />
            <div className={s.rangeScale} aria-hidden="true"><span>1</span><span>120</span></div>
          </div>

          <div className={s.field}>
            <div className={s.fieldHead}>
              <label htmlFor="avg-minutes">Average call length</label>
              <output htmlFor="avg-minutes" className={s.fieldValue}>
                {Math.floor(avgMinutes)}m {avgMinutes % 1 ? "30s" : "00s"}
              </output>
            </div>
            <input
              id="avg-minutes"
              className={s.range}
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={avgMinutes}
              aria-valuetext={`${avgMinutes} minutes`}
              onChange={(event) => setAvgMinutes(Number(event.target.value))}
              style={{ "--fill": `${((avgMinutes - 0.5) / 9.5) * 100}%` } as CSSProperties}
            />
            <div className={s.rangeScale} aria-hidden="true"><span>30s</span><span>10m</span></div>
          </div>

          <fieldset className={s.days}>
            <legend>Days open per month</legend>
            <div className={s.dayOptions}>
              {dayOptions.map((days) => (
                <label key={days} className={s.dayOption}>
                  <input
                    type="radio"
                    name="days-open"
                    value={days}
                    checked={daysOpen === days}
                    onChange={() => setDaysOpen(days)}
                  />
                  <span>
                    <strong>{days}</strong>
                    {days === 22 ? "Mon–Fri" : days === 26 ? "Mon–Sat" : "Every day"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className={s.result}>
          <p className={s.resultLabel}>Estimated billable minutes</p>
          <p className={s.resultValue}>
            <AnimatedNumber value={monthlyMinutes} duration={320} />
            <span> min / month</span>
            <span className={s.srOnly}>{inr(monthlyMinutes)} minutes per month</span>
          </p>
          <p className={s.formula}>
            <span className={s.mono}>{callsPerDay}</span> calls × <span className={s.mono}>{billablePerCall}</span> billed
            min × <span className={s.mono}>{daysOpen}</span> days
          </p>

          <div className={s.meter}>
            <div className={s.meterHead}>
              <span>{meterPlan.name} allowance</span>
              <span className={s.mono}>{inr(Math.min(monthlyMinutes, meterPlan.minutes))} / {inr(meterPlan.minutes)}</span>
            </div>
            <div className={s.meterTrack} data-over={recommended ? undefined : "true"}>
              <span style={{ transform: `scaleX(${meterFill / 100})` }} />
            </div>
          </div>

          <div className={s.recommendation} aria-live="polite">
            {recommended ? (
              <>
                <p className={s.recommendLabel}>Smallest plan that covers it</p>
                <p className={s.recommendName}>
                  {recommended.name}
                  <span className={s.mono}>₹{inr(monthlyPrice(recommended, billing))}/mo</span>
                </p>
                <p className={s.recommendNote}>
                  Leaves about <span className={s.mono}>{inr(recommended.minutes - monthlyMinutes)}</span> minutes of
                  headroom each month.
                </p>
                <button type="button" className={s.viewPlan} onClick={() => showPlan(recommended.id)}>
                  View {recommended.name}
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4" /></svg>
                </button>
              </>
            ) : (
              <>
                <p className={s.recommendLabel}>Above every plan</p>
                <p className={s.recommendName}>Custom allowance</p>
                <p className={s.recommendNote}>
                  That is more than the Agency plan&apos;s 2,500 minutes. Contact Creators Touch to size a custom plan.
                </p>
              </>
            )}
          </div>
          <p className={s.resultFootnote}>
            Each call bills whole minutes, so a 2m 30s call counts as 3. This is an estimate, not a quote.
          </p>
        </div>
      </section>

      <section className={s.today} aria-labelledby="today-title">
        <h2 id="today-title">How billing works today</h2>
        <div className={s.todayItem}>
          <span className={s.status} data-status="live">Live</span>
          <p><strong>Minutes are metered</strong>Every phone call records its length, rounded up to the minute.</p>
        </div>
        <div className={s.todayItem}>
          <span className={s.status} data-status="partial">Partial</span>
          <p><strong>Checkout</strong>Stripe checkout opens once keys are connected. Subscriptions are not recorded yet.</p>
        </div>
        <div className={s.todayItem}>
          <span className={s.status} data-status="planned">Planned</span>
          <p><strong>Automatic limits</strong>Allowances above are not enforced automatically yet.</p>
        </div>
      </section>
    </main>
  );
}
