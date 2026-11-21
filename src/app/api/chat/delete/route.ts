import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { currentVisitor } from "@/lib/visitor";

export const dynamic = "force-dynamic";

/** Visitors can permanently delete their own conversations (messages and any sent summary). */
export async function POST(req: Request) {
  const session = await currentVisitor();
  if (!session) return Response.json({ error: "Not found." }, { status: 404 });
  const parsed = z.object({ conversation_id: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  const deleted = await db
    .delete(schema.conversations)
    .where(and(eq(schema.conversations.id, parsed.data.conversation_id), eq(schema.conversations.visitorId, session.visitor.id)))
    .returning({ id: schema.conversations.id });
  if (deleted.length === 0) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ deleted: true });
}
