import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export async function getRuntimeEnv() {
  const runtime = await import("cloudflare:workers");
  return runtime.env;
}

export async function getDb() {
  const env = await getRuntimeEnv();
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Check the `d1_databases` binding in wrangler.jsonc and run `npm run db:migrate`."
    );
  }

  return drizzle(env.DB, { schema });
}
