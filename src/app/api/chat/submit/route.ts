import { and, asc, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { open, seal } from "@/lib/crypto";
import { notifyOwnerOfSummary } from "@/lib/email";
import { rateLimit } from "@/lib/ratelimit";
import { chatEnabled } from "@/lib/settings";
import { generateSummary, type Summary } from "@/lib/summary";
import { currentVisitor } from "@/lib/visitor";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversation_id: z.uuid(),
  action: z.enum(["preview", "send"]),
});

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

/**
 * "Send to owner", in two steps:
 *  - preview: generate the AI summary and show it to the visitor (stored sealed with their key)
 *  - send:    publish that exact previewed summary to the owner's dashboard
 * The owner never receives anything the visitor hasn't seen and approved.
 */
export async function POST(req: Request) {
  if (!chatEnabled()) return json({ error: "Not available right now." }, 503);
  const session = await currentVisitor();
  if (!session || session.visitor.status !== "active") return json({ error: "Not available." }, 403);
  const { visitor, key } = session;

  let input: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Invalid request." }, 400);
    input = parsed.data;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const { conversations: conv, messages: msg } = schema;
  const [c] = await db
    .select({ id: conv.id, lastMessageAt: conv.lastMessageAt, draftSealed: conv.draftSealed, status: conv.status, submittedAt: conv.submittedAt })
    .from(conv)
    .where(and(eq(conv.id, input.conversation_id), eq(conv.visitorId, visitor.id)));
  if (!c) return json({ error: "Conversation not found." }, 404);

  if (input.action === "preview") {
    const rl = await rateLimit(`submit:${visitor.id}`, 10, 3600);
    if (!rl.ok) return json({ error: `Too many previews. Try again in ${Math.ceil(rl.retryAfter / 60)} min.` }, 429);

    const rows = await db
      .select({ role: msg.role, sealed: msg.contentSealed, error: msg.error })
      .from(msg)
      .where(eq(msg.conversationId, c.id))
      .orderBy(asc(msg.createdAt));
    const transcript = rows
      .filter((m) => !(m.role === "assistant" && m.error))
      .map((m) => ({ role: m.role, text: open(key, m.sealed) }))
      .filter((m): m is { role: "user" | "assistant"; text: string } => Boolean(m.text));
    if (!transcript.some((m) => m.role === "user")) return json({ error: "Say something first." }, 400);

    const result = await generateSummary(transcript);
    if (!result.ok) return json({ error: `Couldn't create a summary (${result.error}). Please try again.` }, 502);

    const draft = { ...result.summary, basedOn: c.lastMessageAt.toISOString() };
    await db.update(conv).set({ draftSealed: seal(key, JSON.stringify(draft)) }).where(eq(conv.id, c.id));
    // The visitor sees the topic and summary only, not the internal safety flag.
    return json({ topic: draft.topic, summary: draft.summary });
  }

  // send
  const raw = c.draftSealed ? open(key, c.draftSealed) : null;
  if (!raw) return json({ error: "Please preview the summary first." }, 409);
  const draft = JSON.parse(raw) as Summary & { basedOn: string };
  if (new Date(draft.basedOn).getTime() !== c.lastMessageAt.getTime()) {
    return json({ error: "The conversation changed since the preview. Please preview again." }, 409);
  }

  const now = new Date();
  await db
    .update(conv)
    .set({
      topic: draft.topic,
      summary: draft.summary,
      summaryUpdatedAt: now,
      summaryError: null,
      submittedAt: now,
      draftSealed: null,
      readAt: null,
      ...(draft.flag
        ? {
            status: sql`case when ${conv.status} = 'active' then 'flagged'::conversation_status else ${conv.status} end`,
            flagReason: draft.flag_reason,
          }
        : {}),
    })
    .where(eq(conv.id, c.id));

  // Email the owner the approved summary (only if Resend is configured). Runs after the response.
  after(() =>
    notifyOwnerOfSummary({
      id: c.id,
      topic: draft.topic,
      summary: draft.summary,
      flagged: draft.flag,
      flagReason: draft.flag ? draft.flag_reason : null,
      isUpdate: c.submittedAt !== null,
    }),
  );
  return json({ sent: true, submitted_at: now.toISOString() });
}
