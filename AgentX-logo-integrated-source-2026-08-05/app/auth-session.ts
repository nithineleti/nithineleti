import { getRuntimeEnv } from "../db";

/**
 * Server-side session plumbing for Supabase auth.
 *
 * Tokens live in HttpOnly cookies so browser JavaScript can never read them.
 * Only Route Handlers may write cookies, so every function that mints or clears
 * a session returns a Response with the right `Set-Cookie` headers attached.
 */

export const ACCESS_COOKIE = "agentx_access_token";
export const REFRESH_COOKIE = "agentx_refresh_token";
export const VERIFIER_COOKIE = "agentx_pkce_verifier";

export type SupabaseConfig = { url: string; anonKey: string };

export type TokenSet = {
  error_code?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
  msg?: string;
};

/**
 * The dashboard shows several URLs (REST, GraphQL, auth). Only the project root
 * is correct here, so strip any API path someone copies by mistake -- a URL
 * ending in /rest/v1/ otherwise sends every auth call to a 404.
 */
export function normaliseSupabaseUrl(value: string | undefined) {
  if (!value) return "";
  return value.trim().replace(/\/+$/, "").replace(/\/(rest|auth|graphql|storage|realtime)\/v1$/i, "");
}

export async function getSupabaseConfig(): Promise<SupabaseConfig | null> {
  const env = (await getRuntimeEnv()) as unknown as Record<string, string | undefined>;
  const url = normaliseSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/** Only send Secure cookies over HTTPS, so local http development still works. */
function isSecure(request: Request) {
  const proto = request.headers.get("x-forwarded-proto");
  return proto ? proto.split(",")[0].trim() === "https" : new URL(request.url).protocol === "https:";
}

function cookie(
  request: Request,
  name: string,
  value: string,
  maxAgeSeconds: number,
) {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecure(request)) parts.push("Secure");
  return parts.join("; ");
}

/** Cookie headers that establish a session. */
export function sessionCookies(request: Request, tokens: TokenSet): string[] {
  const headers: string[] = [];
  if (tokens.access_token) {
    headers.push(
      cookie(request, ACCESS_COOKIE, tokens.access_token, tokens.expires_in ?? 3600),
    );
  }
  if (tokens.refresh_token) {
    // Refresh tokens are long-lived; 30 days keeps users signed in between visits.
    headers.push(cookie(request, REFRESH_COOKIE, tokens.refresh_token, 60 * 60 * 24 * 30));
  }
  // The PKCE verifier is single-use. Always clear it once a session is minted.
  headers.push(cookie(request, VERIFIER_COOKIE, "", 0));
  return headers;
}

/** Cookie headers that destroy a session. */
export function clearedCookies(request: Request): string[] {
  return [ACCESS_COOKIE, REFRESH_COOKIE, VERIFIER_COOKIE].map((name) =>
    cookie(request, name, "", 0),
  );
}

export function withCookies(response: Response, cookies: string[]): Response {
  const headers = new Headers(response.headers);
  for (const value of cookies) headers.append("set-cookie", value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

/** POST to a Supabase auth endpoint with the anon key attached. */
export async function supabaseAuth(
  config: SupabaseConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: TokenSet }> {
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let data: TokenSet = {};
  try {
    data = (await response.json()) as TokenSet;
  } catch {
    data = {};
  }
  if (!response.ok) {
    // The operator needs the provider's own reason; the browser must not see it.
    console.error("Supabase auth failed", path, response.status, data.error_code || data.error || "");
  }
  return { ok: response.ok, status: response.status, data };
}

/**
 * Supabase returns provider errors in several shapes. Never forward the raw text
 * to the browser -- it can leak account existence and provider internals.
 */
export function safeAuthError(data: TokenSet, fallback: string): string {
  const code = `${data.error_code || ""}`.toLowerCase();
  const raw = `${data.error_description || data.error || data.msg || ""}`.toLowerCase();

  // Confirmation emails are rate limited per project, and the window is hours
  // rather than minutes, so do not promise a quick retry.
  if (code.includes("over_email_send_rate_limit") || raw.includes("email rate limit")) {
    return "This project has sent too many confirmation emails recently. Try again later, or ask the site owner to turn off email confirmation.";
  }
  if (code.includes("email_address_invalid") || raw.includes("invalid format") || raw.includes("is invalid")) {
    return "That email address was rejected. Use a real address you can receive mail at.";
  }
  if (code.includes("weak_password") || raw.includes("password should be")) {
    return "Choose a stronger password — at least 8 characters.";
  }
  if (code.includes("signup_disabled") || raw.includes("signups not allowed")) {
    return "New accounts are disabled for this project.";
  }
  if (raw.includes("invalid login") || raw.includes("invalid credentials")) {
    return "That email and password combination is not correct.";
  }
  if (raw.includes("email not confirmed")) {
    return "Confirm your email address, then sign in.";
  }
  if (raw.includes("already registered") || raw.includes("already been registered")) {
    return "An account with that email already exists. Try signing in.";
  }
  if (raw.includes("token has expired") || raw.includes("expired")) {
    return "That code has expired. Request a new one.";
  }
  if (raw.includes("rate limit") || raw.includes("too many")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  return fallback;
}

/** Only ever redirect to a path on this site. */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value) return "/studio";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/studio";
}
