import { getAgentXUser } from "../../../auth";
import { getVapiConfig, vapiFetch } from "../../../vapi";

export const runtime = "edge";

type Named = { id?: string; name?: string; number?: string; provider?: string; status?: string };

/**
 * Read-only summary of what the connected Vapi account holds: assistants,
 * phone numbers and knowledge-base files. Used by the studio to show what is
 * available without exposing the private key to the browser.
 */
export async function GET() {
  if (!(await getAgentXUser())) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const config = await getVapiConfig();
  if (!config) {
    return Response.json({ connected: false, error: "Voice platform is not connected." }, { status: 503 });
  }

  const [assistants, numbers, files] = await Promise.all([
    vapiFetch<Named[]>(config, "/assistant"),
    vapiFetch<Named[]>(config, "/phone-number"),
    vapiFetch<Named[]>(config, "/file"),
  ]);

  if (!assistants.ok) {
    return Response.json({ connected: false, error: assistants.error }, { status: assistants.status });
  }

  const list = (r: typeof numbers) => (r.ok && Array.isArray(r.data) ? r.data : []);
  return Response.json({
    connected: true,
    publicKey: config.publicKey || null,
    assistants: (assistants.data || []).map((a) => ({ id: a.id, name: a.name })),
    phoneNumbers: list(numbers).map((n) => ({ id: n.id, number: n.number, provider: n.provider })),
    files: list(files).map((f) => ({ id: f.id, name: f.name, status: f.status })),
  });
}
