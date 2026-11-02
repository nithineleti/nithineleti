import { getSupabaseConfig } from "../../../auth-session";

type Settings = {
  external?: Record<string, boolean>;
  disable_signup?: boolean;
  mailer_autoconfirm?: boolean;
};

/**
 * Reports which sign-in methods are actually enabled in the identity provider,
 * so the login page never shows a button that dead-ends on a provider error.
 */
export async function GET() {
  const config = await getSupabaseConfig();
  if (!config) {
    return Response.json(
      { configured: false, email: false, google: false, phone: false, signup: false, confirmEmail: false },
      { headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.anonKey },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(String(response.status));
    const settings = (await response.json()) as Settings;
    const external = settings.external || {};
    return Response.json(
      {
        configured: true,
        email: Boolean(external.email),
        google: Boolean(external.google),
        phone: Boolean(external.phone),
        signup: !settings.disable_signup,
        // When true, a new account cannot sign in until the emailed link is used.
        confirmEmail: !settings.mailer_autoconfirm,
      },
      // Provider toggles change rarely; a short cache spares a round trip per view.
      { headers: { "cache-control": "public, max-age=60" } },
    );
  } catch {
    // If the provider cannot be reached, fall back to email only rather than
    // advertising methods we cannot confirm.
    return Response.json(
      { configured: true, email: true, google: false, phone: false, signup: true, confirmEmail: true },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
