import {
  VERIFIER_COOKIE,
  getSupabaseConfig,
  readCookie,
  safeReturnPath,
  sessionCookies,
  supabaseAuth,
  withCookies,
} from "../../../auth-session";

/** Completes the OAuth flow: exchanges the code for a session and sets cookies. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get("return_to"));
  const failure = (reason: string) =>
    Response.redirect(
      new URL(`/login?error=${reason}&return_to=${encodeURIComponent(returnTo)}`, url.origin),
      302,
    );

  if (url.searchParams.get("error")) return failure("denied");

  const config = await getSupabaseConfig();
  if (!config) return failure("unconfigured");

  const code = url.searchParams.get("code");
  const verifier = readCookie(request, VERIFIER_COOKIE);
  if (!code || !verifier) return failure("expired");

  const exchanged = await supabaseAuth(config, "token?grant_type=pkce", {
    auth_code: code,
    code_verifier: verifier,
  });
  if (!exchanged.ok || !exchanged.data.access_token) return failure("exchange");

  return withCookies(
    Response.redirect(new URL(returnTo, url.origin), 302),
    sessionCookies(request, exchanged.data),
  );
}
