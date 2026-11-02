import {
  REFRESH_COOKIE,
  clearedCookies,
  getSupabaseConfig,
  readCookie,
  sessionCookies,
  supabaseAuth,
  withCookies,
} from "../../../auth-session";

/** Exchanges the refresh token for a new access token and re-sets the cookies. */
export async function POST(request: Request) {
  const config = await getSupabaseConfig();
  if (!config) {
    return Response.json({ error: "Sign-in is not configured yet." }, { status: 503 });
  }

  const refreshToken = readCookie(request, REFRESH_COOKIE);
  if (!refreshToken) {
    return Response.json({ error: "No session to refresh." }, { status: 401 });
  }

  const refreshed = await supabaseAuth(config, "token?grant_type=refresh_token", {
    refresh_token: refreshToken,
  });
  if (!refreshed.ok || !refreshed.data.access_token) {
    // The refresh token is dead. Clear everything so the client stops retrying.
    return withCookies(
      Response.json({ error: "Session expired. Please sign in again." }, { status: 401 }),
      clearedCookies(request),
    );
  }

  return withCookies(Response.json({ ok: true }), sessionCookies(request, refreshed.data));
}
