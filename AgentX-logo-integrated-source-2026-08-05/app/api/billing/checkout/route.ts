import { getRuntimeEnv } from "../../../../db";
import { getAgentXUser } from "../../../auth";
import { enforceRequestLimit } from "../../request-limiter";

const planKeys: Record<string, Record<string, string>> = {
  starter: { monthly: "STRIPE_PRICE_STARTER_MONTHLY", annual: "STRIPE_PRICE_STARTER_ANNUAL" },
  professional: { monthly: "STRIPE_PRICE_PRO_MONTHLY", annual: "STRIPE_PRICE_PRO_ANNUAL" },
  agency: { monthly: "STRIPE_PRICE_AGENCY_MONTHLY", annual: "STRIPE_PRICE_AGENCY_ANNUAL" },
};

export async function POST(request: Request) {
  const user = await getAgentXUser();
  if (!user) return Response.json({ error: "Sign in before choosing a plan." }, { status: 401 });
  const limited = await enforceRequestLimit(request, {
    scope: "billing-checkout",
    maxRequests: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;
  const body = (await request.json()) as { plan?: string; billing?: string };
  const plan = body.plan || "";
  const billing = body.billing === "annual" ? "annual" : "monthly";
  const env = (await getRuntimeEnv()) as unknown as Record<string, string | undefined>;
  const secret = env.STRIPE_SECRET_KEY;
  const priceKey = planKeys[plan]?.[billing];
  const price = priceKey ? env[priceKey] : undefined;
  if (!secret || !price) {
    return Response.json({
      error: "Stripe test billing is ready for configuration. Connect the Stripe secret and INR Price IDs to activate checkout.",
    }, { status: 503 });
  }
  const origin = new URL(request.url).origin;
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("customer_email", user.email);
  params.set("line_items[0][price]", price);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${origin}/studio?subscription=success`);
  params.set("cancel_url", `${origin}/pricing?subscription=cancelled`);
  params.set("metadata[plan]", plan);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const result = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok || !result.url) {
    return Response.json({ error: result.error?.message || "Stripe checkout could not start." }, { status: 502 });
  }
  return Response.json({ url: result.url });
}
