import { getRuntimeEnv } from "../db";

/**
 * Vapi integration.
 *
 * Credentials come from the environment and never appear in source or in the
 * browser bundle. Only the PUBLIC key is ever safe to expose to a page; the
 * private key stays inside the Worker.
 *
 *   VAPI_PRIVATE_KEY   server-only. Creates calls, assistants, uploads files.
 *   VAPI_PUBLIC_KEY    safe for the browser Web SDK.
 *   VAPI_WEBHOOK_SECRET  shared secret Vapi sends back on every webhook.
 *   VAPI_API_BASE_URL  defaults to Vapi's public API.
 */
export type VapiConfig = {
  privateKey: string;
  publicKey: string;
  webhookSecret: string;
  baseUrl: string;
};

function read(env: Record<string, string | undefined>, name: string) {
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export async function getVapiConfig(): Promise<VapiConfig | null> {
  const env = (await getRuntimeEnv()) as unknown as Record<string, string | undefined>;
  const privateKey = read(env, "VAPI_PRIVATE_KEY");
  if (!privateKey) return null;
  return {
    privateKey,
    publicKey: read(env, "VAPI_PUBLIC_KEY"),
    webhookSecret: read(env, "VAPI_WEBHOOK_SECRET"),
    baseUrl: (read(env, "VAPI_API_BASE_URL") || "https://api.vapi.ai").replace(/\/+$/, ""),
  };
}

export async function isVapiConfigured(): Promise<boolean> {
  return (await getVapiConfig()) !== null;
}

/**
 * Vapi reports call cost in USD. Billing here is in INR, so convert before
 * storing, or costs are under-recorded by roughly the exchange rate and every
 * margin calculation built on them is wrong.
 *
 * PROVIDER_USD_TO_INR should track your actual settlement rate.
 */
export async function usdToPaise(usd: number): Promise<number> {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  const env = (await getRuntimeEnv()) as unknown as Record<string, string | undefined>;
  const parsed = Number(env.PROVIDER_USD_TO_INR);
  const rate = Number.isFinite(parsed) && parsed > 0 ? parsed : 88;
  return Math.round(usd * rate * 100);
}

type VapiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** Calls the Vapi REST API. Never surfaces raw provider text to the browser. */
export async function vapiFetch<T = unknown>(
  config: VapiConfig,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<VapiResult<T>> {
  try {
    const response = await fetch(`${config.baseUrl}/${path.replace(/^\/+/, "")}`, {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${config.privateKey}`,
        "content-type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) {
      console.error("Vapi API error", path, response.status);
      return { ok: false, status: response.status, error: "The voice platform rejected the request." };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 502, error: "The voice platform is unreachable." };
  }
}

/**
 * Constant-time comparison for the webhook shared secret, so a timing side
 * channel cannot be used to recover it byte by byte.
 */
export function secretMatches(expected: string, received: string) {
  if (!expected || !received || expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

/** Maps an AgentX blueprint row onto a Vapi assistant definition. */
export function toVapiAssistant(agent: {
  name: string;
  businessName: string;
  instructions: string;
  welcomeMessage: string;
  languages: string;
}, serverUrl: string, serverSecret: string) {
  return {
    name: `${agent.name} — ${agent.businessName}`.slice(0, 80),
    firstMessage: agent.welcomeMessage,
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: agent.instructions }],
      tools: VAPI_TOOLS,
    },
    // Route tool calls and the end-of-call report back to this Worker.
    server: { url: serverUrl, secret: serverSecret },
    serverMessages: ["tool-calls", "end-of-call-report", "status-update"],
  };
}

/** The same three business actions the web agent exposes, in Vapi's schema. */
export const VAPI_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_lead",
      description: "Save a qualified business enquiry after the caller consents.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          company: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          location: { type: "string" },
          service: { type: "string" },
          timeline: { type: "string" },
          preferredContact: { type: "string" },
          consentConfirmed: { type: "boolean" },
        },
        required: ["name", "service", "consentConfirmed"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_appointment",
      description: "Create an appointment request for the team to confirm.",
      parameters: {
        type: "object",
        properties: {
          leadId: { type: "string" },
          name: { type: "string" },
          contact: { type: "string" },
          requestedDate: { type: "string" },
          requestedTime: { type: "string" },
          timezone: { type: "string" },
          service: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name", "contact", "requestedDate", "timezone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_human_handoff",
      description: "Queue a request for a team member to contact the caller.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          contact: { type: "string" },
          reason: { type: "string" },
          urgency: { type: "string", enum: ["low", "normal", "high"] },
        },
        required: ["contact", "reason"],
      },
    },
  },
] as const;
