import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Railway healthcheck. On failure it returns a coarse reason (never secrets or raw
 * error text) so a broken deploy can be diagnosed without access to the logs.
 */
export async function GET() {
  const config = {
    database_url: Boolean(process.env.DATABASE_URL),
    auth_secret: Boolean(process.env.AUTH_SECRET),
    anthropic_api_key: Boolean(process.env.ANTHROPIC_API_KEY),
    redis_url: Boolean(process.env.REDIS_URL),
  };
  if (!config.database_url) return Response.json({ ok: false, reason: "database_url_missing", config }, { status: 500 });
  try {
    // Touches a real table, so missing migrations show up here too.
    await db.execute(sql`select 1 from conversations limit 1`);
    return Response.json({ ok: true, config });
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    const code = err.code ?? err.cause?.code ?? "";
    const reason =
      code === "42P01" ? "migrations_not_run"
      : code === "28P01" || code === "28000" ? "database_auth_failed"
      : code === "3D000" ? "database_does_not_exist"
      : ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "CONNECT_TIMEOUT", "ECONNRESET"].includes(code) ? "database_unreachable"
      : "database_error";
    console.error(`healthcheck failed: ${reason} (${code || "no code"})`);
    return Response.json({ ok: false, reason, code: code || null, config }, { status: 500 });
  }
}
