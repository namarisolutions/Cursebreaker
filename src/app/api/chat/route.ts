import Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { shouldFlag } from "@/lib/flagging";
import { rateLimit } from "@/lib/ratelimit";
import { APP_NAME, chatEnabled, getSettings, MODEL } from "@/lib/settings";
import { open as unseal, seal } from "@/lib/crypto";
import { getOrCreateVisitor } from "@/lib/visitor";

export const dynamic = "force-dynamic";

const MAX_MESSAGE = Number(process.env.MAX_MESSAGE_LENGTH ?? 4000);
const MAX_CONVERSATION_MESSAGES = Number(process.env.MAX_CONVERSATION_MESSAGES ?? 200);
const EFFORT = (process.env.CHAT_EFFORT ?? "low") as "low" | "medium" | "high";

const bodySchema = z.object({
  conversation_id: z.uuid().optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE),
});

/** Always appended after the owner's prompt; not editable from the dashboard. */
const FIXED_RULES = `Context: you are chatting with an anonymous visitor on ${APP_NAME}'s website. You act as a privacy shield between the visitor and the site owner.

How sharing works, so you can explain it accurately:
- Nothing from this conversation reaches the owner unless the visitor presses the "Send to owner" button below the chat.
- When they press it, an AI writes a short summary and the visitor sees a preview first. They can send it, or keep chatting and preview again. After sending, they can send updates the same way.
- The owner only ever sees that summary, never the visitor's words. It paraphrases instead of quoting, removes names, places, employers, and other identifying details, and leaves out anything the visitor asks to keep out of it, unless someone may be at risk of harm, in which case the owner is alerted in general terms.
- The visitor can permanently delete a conversation (including anything they sent) with the "Delete" link next to the Send to owner button. The site's privacy page explains all of this at /privacy.
- The conversation is still processed by an AI provider, so don't promise absolute secrecy.

If the visitor wants to get something to the owner, help them say it clearly, then remind them to press "Send to owner" when they're ready. If they ask what the owner can see, explain the above honestly.

The owner can't contact or identify visitors. If a visitor seems to be in crisis or at risk, you are the only one who can respond in the moment, so respond with care and share appropriate crisis resources.

Replies are shown as plain text, so do not use Markdown (no headings, bold, tables, or code fences). Plain line breaks and simple "-" lists are fine.`;

let client: Anthropic | null = null;

const err = (status: number, error: string, headers: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store", ...headers } });

export async function POST(req: Request) {
  if (!chatEnabled()) return err(503, "The assistant isn't configured yet. Please check back soon.");

  let input: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return err(400, `Messages must be 1 to ${MAX_MESSAGE} characters.`);
    input = parsed.data;
  } catch {
    return err(400, "Invalid request.");
  }

  // Overall spend guard, then per-visitor limits. Never keyed on IP.
  const global = await rateLimit("chat:global", Number(process.env.CHAT_MESSAGES_PER_HOUR ?? 2000), 3600);
  if (!global.ok) return err(429, "The assistant is very busy right now. Please try again shortly.", { "retry-after": String(global.retryAfter) });

  const { visitor, key } = await getOrCreateVisitor();
  if (visitor.status === "blocked") return err(403, "This chat is no longer available.");
  for (const [limit, window] of [
    [Number(process.env.CHAT_PER_MINUTE ?? 8), 60],
    [Number(process.env.CHAT_PER_DAY ?? 300), 86_400],
  ] as const) {
    const rl = await rateLimit(`chat:${visitor.id}:${window}`, limit, window);
    if (!rl.ok) return err(429, `You're sending messages too quickly. Try again in ${rl.retryAfter}s.`, { "retry-after": String(rl.retryAfter) });
  }

  // Resolve or start the conversation. Visitors can only continue their own.
  let conversationId = input.conversation_id;
  if (conversationId) {
    const [c] = await db
      .select({ id: schema.conversations.id, count: schema.conversations.messageCount })
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.visitorId, visitor.id)));
    if (!c) return err(404, "Conversation not found.");
    if (c.count >= MAX_CONVERSATION_MESSAGES) return err(409, "This conversation has reached its length limit. Please start a new one.");
  } else {
    const title = input.message.replace(/\s+/g, " ").slice(0, 80);
    [{ id: conversationId }] = await db
      .insert(schema.conversations)
      .values({ visitorId: visitor.id, titleSealed: seal(key, title) })
      .returning({ id: schema.conversations.id });
  }
  const convId = conversationId!;

  const flagged = shouldFlag(input.message);
  await db.insert(schema.messages).values({ conversationId: convId, role: "user", contentSealed: seal(key, input.message) });
  await db
    .update(schema.conversations)
    .set({
      messageCount: sql`${schema.conversations.messageCount} + 1`,
      lastMessageAt: new Date(),
      readAt: null,
      ...(flagged ? { status: sql`case when ${schema.conversations.status} = 'active' then 'flagged'::conversation_status else ${schema.conversations.status} end`, flagReason: "matched an auto-flag pattern" } : {}),
    })
    .where(eq(schema.conversations.id, convId));

  const history = await db
    .select({ role: schema.messages.role, sealed: schema.messages.contentSealed, error: schema.messages.error })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, convId))
    .orderBy(asc(schema.messages.createdAt));
  // Failed assistant turns are kept for the owner but not replayed to the model.
  const transcript = history
    .filter((m) => !(m.role === "assistant" && m.error))
    .map((m) => ({ role: m.role, text: unseal(key, m.sealed) }))
    .filter((m): m is { role: "user" | "assistant"; text: string } => m.text !== null && m.text !== "");
  const apiMessages: Anthropic.Beta.BetaMessageParam[] = transcript.map((m) => ({ role: m.role, content: m.text }));

  const { system_prompt } = await getSettings();
  client ??= new Anthropic();

  const encoder = new TextEncoder();
  let open = true;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          open = false;
        }
      };
      let text = "";
      let row: Partial<typeof schema.messages.$inferInsert> = {};
      try {
        const stream = client!.beta.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          // On a safety-classifier refusal, the API continues on a fallback model in the same stream.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: EFFORT },
          cache_control: { type: "ephemeral" },
          system: [
            { type: "text", text: system_prompt },
            { type: "text", text: FIXED_RULES },
          ],
          messages: apiMessages,
        });
        stream.on("text", (delta) => {
          text += delta;
          send(delta);
        });
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          const note = "Sorry, I can't help with that one.";
          send(text ? `\n\n${note}` : note);
          text = text ? `${text}\n\n${note}` : note;
        } else if (final.stop_reason === "max_tokens") {
          send("…");
          text += "…";
        }
        row = {
          model: final.model,
          stopReason: final.stop_reason,
          inputTokens:
            (final.usage.input_tokens ?? 0) +
            (final.usage.cache_read_input_tokens ?? 0) +
            (final.usage.cache_creation_input_tokens ?? 0),
          outputTokens: final.usage.output_tokens,
        };
      } catch (e) {
        const msg = e instanceof Anthropic.APIError ? `API ${e.status ?? ""}: ${e.message}` : (e as Error).message;
        console.error(`chat failed for conversation ${convId}: ${msg}`);
        row = { error: msg.slice(0, 500) };
        send(`${text ? "\n\n" : ""}[Something went wrong. Please try again.]`);
      }

      // Saved even if the visitor closed the tab mid-reply, so the owner sees the whole transcript.
      await db.insert(schema.messages).values({ conversationId: convId, role: "assistant", contentSealed: seal(key, text), model: MODEL, ...row });
      await db
        .update(schema.conversations)
        .set({ messageCount: sql`${schema.conversations.messageCount} + 1`, lastMessageAt: new Date() })
        .where(eq(schema.conversations.id, convId));
      if (open) {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }

    },
    cancel() {
      // Visitor disconnected: keep generating so the transcript is complete, just stop sending.
      open = false;
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-conversation-id": convId,
      "x-accel-buffering": "no",
    },
  });
}
