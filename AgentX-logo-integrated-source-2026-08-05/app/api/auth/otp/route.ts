import {
  getSupabaseConfig,
  safeAuthError,
  sessionCookies,
  supabaseAuth,
  withCookies,
} from "../../../auth-session";

type Payload = { phone?: string; code?: string };

/** POST with a phone number to send a code; add `code` to verify it. */
export async function POST(request: Request) {
  const config = await getSupabaseConfig();
  if (!config) {
    return Response.json({ error: "Mobile sign-in is not configured yet." }, { status: 503 });
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const phone = payload.phone?.replace(/[^\d+]/g, "").slice(0, 20) || "";
  if (!/^\+\d{8,19}$/.test(phone)) {
    return Response.json(
      { error: "Enter the number in international format, e.g. +919876543210." },
      { status: 400 },
    );
  }

  const code = payload.code?.replace(/\D/g, "").slice(0, 10);
  if (!code) {
    const sent = await supabaseAuth(config, "otp", { phone });
    if (!sent.ok) {
      return Response.json(
        { error: safeAuthError(sent.data, "Could not send the code.") },
        { status: 400 },
      );
    }
    return Response.json({ ok: true, sent: true });
  }

  const verified = await supabaseAuth(config, "verify", { phone, token: code, type: "sms" });
  if (!verified.ok || !verified.data.access_token) {
    return Response.json(
      { error: safeAuthError(verified.data, "That code is not valid.") },
      { status: 401 },
    );
  }
  return withCookies(Response.json({ ok: true }), sessionCookies(request, verified.data));
}
