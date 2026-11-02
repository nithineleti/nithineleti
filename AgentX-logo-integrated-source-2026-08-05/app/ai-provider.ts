import { getRuntimeEnv } from "../db";

/**
 * Central configuration for the AI voice and language services.
 *
 * The provider is defined entirely by environment variables, so no vendor name,
 * endpoint or model identifier appears anywhere in the source tree. Swapping
 * providers is a configuration change, not a code change.
 *
 * Required:
 *   AI_API_KEY             server-only credential
 *   AI_API_BASE_URL        e.g. https://<provider-host>/v1
 * Model selection:
 *   AI_REALTIME_MODEL      realtime speech-to-speech model
 *   AI_TRANSCRIPTION_MODEL live transcription model
 *   AI_SPEECH_MODEL        text-to-speech model (voice previews)
 *   AI_TEXT_MODEL          text model (agent blueprint generation)
 * Optional:
 *   AI_CALLER_ID_HEADER    header name for per-caller abuse correlation.
 *                          Omit to send no such header.
 */
export type AIService = {
  apiKey: string;
  baseUrl: string;
  realtimeModel: string;
  transcriptionModel: string;
  speechModel: string;
  textModel: string;
  callerIdHeader: string | null;
};

function readEnv(env: Record<string, string | undefined>, name: string) {
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** Returns null when the AI provider has not been configured. */
export async function getAIService(): Promise<AIService | null> {
  const env = (await getRuntimeEnv()) as unknown as Record<string, string | undefined>;

  const apiKey = readEnv(env, "AI_API_KEY");
  const baseUrl = readEnv(env, "AI_API_BASE_URL");
  if (!apiKey || !baseUrl) return null;

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    realtimeModel: readEnv(env, "AI_REALTIME_MODEL"),
    transcriptionModel: readEnv(env, "AI_TRANSCRIPTION_MODEL"),
    speechModel: readEnv(env, "AI_SPEECH_MODEL"),
    textModel: readEnv(env, "AI_TEXT_MODEL"),
    callerIdHeader: readEnv(env, "AI_CALLER_ID_HEADER") || null,
  };
}

/** True when an AI credential is present, without exposing the credential. */
export async function isAIConfigured(): Promise<boolean> {
  return (await getAIService()) !== null;
}

/** Authorization headers for a provider request. */
export function authHeaders(service: AIService, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${service.apiKey}`, ...extra };
}

/** Adds the optional per-caller correlation header when one is configured. */
export function callerIdHeader(service: AIService, callerId: string) {
  return service.callerIdHeader
    ? { [service.callerIdHeader]: callerId.slice(0, 128) }
    : {};
}
