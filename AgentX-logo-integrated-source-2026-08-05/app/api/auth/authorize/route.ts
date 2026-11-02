import {
  VERIFIER_COOKIE,
  getSupabaseConfig,
  safeReturnPath,
  withCookies,
} from "../../../auth-session";

const ALLOWED_PROVIDERS = new Set(["google"]);

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Starts the OAuth flow with PKCE. The verifier is held in a short-lived cookie. */
export async function GET(request: Request) {
  const config = await getSupabaseConfig();
  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get("return_to"));

  if (!config) {
    return Response.redirect(
      new URL(`/login?error=unconfigured&return_to=${encodeURIComponent(returnTo)}`, url.origin),
      302,
    );
  }

  const provider = url.searchParams.get("provider") || "google";
  if (!ALLOWED_PROVIDERS.has(provider)) {
    return Response.redirect(new URL("/login?error=provider", url.origin), 302);
  }

  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));

  const callback = new URL("/api/auth/callback", url.origin);
  callback.searchParams.set("return_to", returnTo);

  const authorize = new URL(`${config.url}/auth/v1/authorize`);
  authorize.searchParams.set("provider", provider);
  authorize.searchParams.set("redirect_to", callback.toString());
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "s256");

  const secure = url.protocol === "https:" ? "; Secure" : "";
  return withCookies(
    Response.redirect(authorize.toString(), 302),
    [`${VERIFIER_COOKIE}=${verifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`],
  );
}
