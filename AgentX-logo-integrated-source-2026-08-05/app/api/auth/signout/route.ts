import {
  ACCESS_COOKIE,
  clearedCookies,
  getSupabaseConfig,
  readCookie,
  withCookies,
} from "../../../auth-session";

export async function POST(request: Request) {
  const config = await getSupabaseConfig();
  const accessToken = readCookie(request, ACCESS_COOKIE);

  // Best effort: revoke server-side, but always clear the cookies locally.
  if (config && accessToken) {
    try {
      await fetch(`${config.url}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      // Ignore -- clearing the cookies below is what actually ends the session.
    }
  }

  return withCookies(Response.json({ ok: true }), clearedCookies(request));
}
