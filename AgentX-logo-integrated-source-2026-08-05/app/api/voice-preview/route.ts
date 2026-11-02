import { getAgentXUser } from "../../auth";
import { authHeaders, getAIService } from "../../ai-provider";
import { enforceRequestLimit } from "../request-limiter";

const allowedVoices = new Set([
  "marin", "cedar", "coral", "alloy", "ash", "ballad", "echo", "sage", "shimmer", "verse",
]);

export async function GET(request: Request) {
  if (!(await getAgentXUser())) {
    return Response.json({ error: "Sign in to preview voices." }, { status: 401 });
  }
  const limited = await enforceRequestLimit(request, {
    scope: "voice-preview",
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;
  const voice = new URL(request.url).searchParams.get("voice") || "marin";
  if (!allowedVoices.has(voice)) {
    return Response.json({ error: "Unsupported voice." }, { status: 400 });
  }
  const ai = await getAIService();
  if (!ai) return Response.json({ error: "Voice preview is not configured." }, { status: 503 });

  const response = await fetch(`${ai.baseUrl}/audio/speech`, {
    method: "POST",
    headers: authHeaders(ai, { "content-type": "application/json" }),
    body: JSON.stringify({
      model: ai.speechModel,
      voice,
      input: "Hello, I am your AgentX voice assistant. I am ready to help your customers.",
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    return Response.json({ error: "Voice preview is temporarily unavailable." }, { status: 502 });
  }
  return new Response(response.body, {
    headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" },
  });
}
