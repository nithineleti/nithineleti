import { isAIConfigured } from "../../ai-provider";
import { getRuntimeEnv } from "../../../db";

export async function GET() {
  const env = await getRuntimeEnv();
  return Response.json({
    ok: true,
    voiceConfigured: await isAIConfigured(),
    databaseConfigured: Boolean(env.DB),
  });
}
