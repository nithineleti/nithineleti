import { agentConfig, realtimeTools } from "../../agent-config";
import { authHeaders, callerIdHeader, getAIService } from "../../ai-provider";
import { getDb } from "../../../db";
import { getAgentXUser } from "../../auth";
import { conversations } from "../../../db/schema";
import { createdAgents } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { enforceRequestLimit } from "../request-limiter";

export const runtime = "edge";

/** Compares two equal-length hex digests without leaking timing information. */
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export async function POST(request: Request) {
  const limited = await enforceRequestLimit(request, {
    scope: "voice-session",
    maxRequests: 5,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const ai = await getAIService();
  if (!ai) {
    return Response.json(
      { error: "Voice service is not configured yet." },
      { status: 503 },
    );
  }

  const sdp = await request.text();
  if (sdp.length > 200_000 || !sdp.startsWith("v=0")) {
    return Response.json({ error: "Invalid WebRTC offer." }, { status: 400 });
  }

  // Authenticate BEFORE touching the database, so an unauthenticated request can
  // never create rows. A caller is authorised either by a signed-in AgentX
  // session, or by presenting a valid Agent ID + access key for a published agent.
  let sessionInstructions = agentConfig.instructions;
  let sessionVoice = agentConfig.voice;
  let sessionTools: unknown = realtimeTools;

  const requestedAgentId = request.headers.get("x-agent-id")?.trim().slice(0, 80);
  const requestedAccessKey = request.headers.get("x-agent-access-key")?.trim().slice(0, 120);
  const usingAgentCredentials = Boolean(requestedAgentId || requestedAccessKey);

  // Every conversation belongs to exactly one tenant. For a signed-in operator
  // that is their own account; for a published agent it is the agent's owner.
  let ownerEmail = "";

  if (!usingAgentCredentials) {
    const user = await getAgentXUser();
    if (!user) {
      return Response.json({ error: "Sign in to AgentX to use voice conversations." }, { status: 401 });
    }
    ownerEmail = user.email.toLowerCase();
  }

  if (usingAgentCredentials) {
    if (!requestedAgentId || !requestedAccessKey) {
      return Response.json({ error: "Both Agent ID and access key are required." }, { status: 401 });
    }
    const rows = await (await getDb())
      .select()
      .from(createdAgents)
      .where(eq(createdAgents.id, requestedAgentId))
      .limit(1);
    const personalAgent = rows[0];
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestedAccessKey));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (!personalAgent || !personalAgent.accessKeyHash || !timingSafeEqual(hash, personalAgent.accessKeyHash)) {
      return Response.json({ error: "The AgentX credentials are not valid." }, { status: 401 });
    }
    sessionInstructions = `${personalAgent.instructions}

Personal configuration:
- Agent name: ${personalAgent.name}
- Business: ${personalAgent.businessName}
- Primary goal: ${personalAgent.primaryGoal}
- Languages: ${personalAgent.languages}
- Tone: ${personalAgent.tone}
- Welcome the user with: ${personalAgent.welcomeMessage}
- Never claim that integrations are active unless a connected tool confirms success.`;
    sessionVoice = personalAgent.voice as typeof agentConfig.voice;
    sessionTools = [];
    ownerEmail = personalAgent.ownerEmail.toLowerCase();
  }

  // Server-generated id: a client-supplied one would let a caller write into or
  // resurrect another conversation's row.
  const conversationId = crypto.randomUUID();

  await (await getDb())
    .insert(conversations)
    .values({
      id: conversationId,
      consentGiven: request.headers.get("x-recording-consent") === "true",
      ownerEmail,
    })
    .onConflictDoNothing();

  const session = {
    type: "realtime",
    model: ai.realtimeModel,
    instructions: sessionInstructions,
    tools: sessionTools,
    tool_choice: "auto",
    audio: {
      input: {
        transcription: { model: ai.transcriptionModel },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "auto",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: sessionVoice },
    },
  };

  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(session));

  const callerId = request.headers.get("cf-ray") || conversationId;

  try {
    const response = await fetch(`${ai.baseUrl}/realtime/calls`, {
      method: "POST",
      headers: authHeaders(ai, callerIdHeader(ai, callerId)),
      body: form,
    });

    const body = await response.text();
    if (!response.ok) {
      console.error("Realtime session failed", response.status);
      return Response.json(
        { error: "The voice service could not start a session." },
        { status: response.status },
      );
    }

    return new Response(body, {
      headers: {
        "content-type": "application/sdp",
        // The client needs the server-generated id to file transcript events.
        "x-conversation-id": conversationId,
      },
    });
  } catch {
    return Response.json(
      { error: "The voice service is temporarily unavailable." },
      { status: 502 },
    );
  }
}
