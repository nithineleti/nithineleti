import {
  getSupabaseConfig,
  safeAuthError,
  sessionCookies,
  supabaseAuth,
  withCookies,
} from "../../../auth-session";

type Payload = { email?: string; password?: string; action?: "signin" | "signup" };

export async function POST(request: Request) {
  const config = await getSupabaseConfig();
  if (!config) {
    return Response.json({ error: "Sign-in is not configured yet." }, { status: 503 });
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = payload.email?.trim().slice(0, 254) || "";
  const password = payload.password || "";
  if (!email || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json(
      { error: "Use a password of at least 8 characters." },
      { status: 400 },
    );
  }

  if (payload.action === "signup") {
    const created = await supabaseAuth(config, "signup", { email, password });
    if (!created.ok) {
      return Response.json(
        { error: safeAuthError(created.data, "Could not create that account.") },
        { status: 400 },
      );
    }
    // Projects with email confirmation enabled return no session yet.
    if (!created.data.access_token) {
      return Response.json({ ok: true, confirmationRequired: true });
    }
    return withCookies(
      Response.json({ ok: true }),
      sessionCookies(request, created.data),
    );
  }

  const signedIn = await supabaseAuth(config, "token?grant_type=password", {
    email,
    password,
  });
  if (!signedIn.ok || !signedIn.data.access_token) {
    return Response.json(
      { error: safeAuthError(signedIn.data, "Could not sign you in.") },
      { status: 401 },
    );
  }
  return withCookies(Response.json({ ok: true }), sessionCookies(request, signedIn.data));
}
