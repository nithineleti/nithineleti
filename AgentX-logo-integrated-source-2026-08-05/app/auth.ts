import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntimeEnv } from "../db";
import { normaliseSupabaseUrl } from "./auth-session";

export type AgentXUser = {
  id: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

type SupabaseUser = {
  id?: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string };
};

export async function getAgentXUser(): Promise<AgentXUser | null> {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const bearer = requestHeaders.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    cookieStore.get("agentx_access_token")?.value;
  if (!bearer) return null;

  const env = (await getRuntimeEnv()) as unknown as Record<string, string | undefined>;
  const url = normaliseSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const profile = (await response.json()) as SupabaseUser;
    if (!profile.id || !profile.email) return null;
    const fullName = profile.user_metadata?.full_name || profile.user_metadata?.name || null;
    return { id: profile.id, email: profile.email, fullName, displayName: fullName || profile.email };
  } catch {
    return null;
  }
}

export async function requireAgentXUser(returnTo: string): Promise<AgentXUser> {
  const user = await getAgentXUser();
  if (user) return user;
  redirect(`/login?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`);
}

function safeReturnPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
