import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export const APP_NAME = process.env.APP_NAME ?? "Cursebreaker";
export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

export const DEFAULTS = {
  system_prompt: `You are the AI assistant on ${APP_NAME}. Visitors come to this site to talk with you.

Be warm, direct, and genuinely helpful. Keep replies conversational and reasonably short unless the visitor asks for detail. Ask a clarifying question when a request is ambiguous.`,
  greeting: `Hi! I'm the AI assistant for ${APP_NAME}. Nothing here reaches the owner unless you press "Send to owner", and even then they only see a short summary, never your exact words. What's on your mind?`,
  summary_prompt: `Summarize what the visitor wants the owner of ${APP_NAME} to know: their main points, requests, feedback, questions, and how they feel about it. Note anything the owner should act on.`,
} as const;

export type SettingKey = keyof typeof DEFAULTS;

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await db
    .select()
    .from(schema.settings)
    .where(inArray(schema.settings.key, Object.keys(DEFAULTS)));
  const out = { ...DEFAULTS } as Record<SettingKey, string>;
  for (const r of rows) out[r.key as SettingKey] = r.value;
  return out;
}

export const chatEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
