import {
  getSupabaseConfig,
  safeAuthError,
  supabaseAuth,
} from "../../../auth-session";
import { enforceRequestLimit } from "../../request-limiter";

/**
 * Re-sends the sign-up confirmation email. Uses the public anon key only, so an
 * operator can recover an unconfirmed account without a service-role key.
 */
export async function POST(request: Request) {
  // Each send consumes the project's email quota, so throttle hard.
  const limited = await enforceRequestLimit(request, {
    scope: "auth-resend",
    maxRequests: 3,
    windowMs: 15 * 60_000,
  });
  if (limited) return limited;

  const config = await getSupabaseConfig();
  if (!config) {
    return Response.json({ error: "Sign-in is not configured yet." }, { status: 503 });
  }

  let payload: { email?: string };
  try {
    payload = (await request.json()) as { email?: string };
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = payload.email?.trim().slice(0, 254) || "";
  if (!email.includes("@")) {
    return Response.json({ error: "Enter the email address you signed up with." }, { status: 400 });
  }

  const sent = await supabaseAuth(config, "resend", { type: "signup", email });
  if (!sent.ok) {
    return Response.json(
      { error: safeAuthError(sent.data, "Could not send the confirmation email.") },
      { status: 400 },
    );
  }
  // Never reveal whether the address is registered.
  return Response.json({ ok: true });
}
