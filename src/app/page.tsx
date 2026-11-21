import type { Metadata } from "next";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { open } from "@/lib/crypto";
import { APP_NAME, chatEnabled, getSettings } from "@/lib/settings";
import { currentVisitor } from "@/lib/visitor";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: APP_NAME };

export default async function Home({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const [session, { greeting }] = await Promise.all([currentVisitor(), getSettings()]);

  let conversations: { id: string; title: string; updatedAt: string }[] = [];
  let messages: { id: string; role: "user" | "assistant"; content: string }[] = [];
  let activeId: string | null = null;
  let sent: { at: string; outdated: boolean } | null = null;

  // Only the visitor's own browser holds the key that decrypts their transcript.
  if (session && session.visitor.status === "active") {
    const { visitor, key } = session;
    const rows = await db
      .select({
        id: schema.conversations.id,
        titleSealed: schema.conversations.titleSealed,
        submittedAt: schema.conversations.submittedAt,
        lastMessageAt: schema.conversations.lastMessageAt,
      })
      .from(schema.conversations)
      .where(eq(schema.conversations.visitorId, visitor.id))
      .orderBy(desc(schema.conversations.lastMessageAt))
      .limit(50);
    conversations = rows.map((r) => ({ id: r.id, title: open(key, r.titleSealed) ?? "Conversation", updatedAt: r.lastMessageAt.toISOString() }));

    if (c && z.uuid().safeParse(c).success && conversations.some((x) => x.id === c)) {
      activeId = c;
      const row = rows.find((r) => r.id === c)!;
      if (row.submittedAt) sent = { at: row.submittedAt.toISOString(), outdated: row.lastMessageAt > row.submittedAt };
      const rowsM = await db
        .select({ id: schema.messages.id, role: schema.messages.role, sealed: schema.messages.contentSealed })
        .from(schema.messages)
        .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
        .where(and(eq(schema.messages.conversationId, c), eq(schema.conversations.visitorId, visitor.id)))
        .orderBy(asc(schema.messages.createdAt));
      messages = rowsM.map((m) => ({ id: m.id, role: m.role, content: open(key, m.sealed) ?? "" }));
    }
  }

  return (
    <Chat
      key={activeId ?? "new"}
      appName={APP_NAME}
      greeting={greeting}
      enabled={chatEnabled() && session?.visitor.status !== "blocked"}
      handle={session?.visitor.handle ?? null}
      conversations={conversations}
      activeId={activeId}
      initialMessages={messages}
      initialSent={sent}
    />
  );
}
