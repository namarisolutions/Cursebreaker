import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { deleteConversation, setConversationStatus, setRead, setVisitorStatus } from "../../actions";
import { AutoRefresh } from "../../auto-refresh";
import { ago, stamp } from "../../format";

const { conversations: conv, messages: msg, visitors } = schema;

/**
 * The owner's view of a conversation: the AI-written summary plus metadata.
 * The visitor's words are encrypted under a key only their browser holds,
 * so they are deliberately not (and cannot be) shown here.
 */
export default async function ConversationSummary({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [c] = await db
    .select({
      id: conv.id,
      topic: conv.topic,
      summary: conv.summary,
      summaryUpdatedAt: conv.summaryUpdatedAt,
      summaryError: conv.summaryError,
      status: conv.status,
      flagReason: conv.flagReason,
      readAt: conv.readAt,
      messageCount: conv.messageCount,
      createdAt: conv.createdAt,
      lastMessageAt: conv.lastMessageAt,
      submittedAt: conv.submittedAt,
      visitorId: visitors.id,
      handle: visitors.handle,
      visitorStatus: visitors.status,
    })
    .from(conv)
    .innerJoin(visitors, eq(visitors.id, conv.visitorId))
    .where(eq(conv.id, id));
  // Unsent conversations are the visitor's alone.
  if (!c || !c.submittedAt) notFound();

  const [[usage], others] = await Promise.all([
    db
      .select({
        inTok: sql<number>`coalesce(sum(${msg.inputTokens}), 0)::int`,
        outTok: sql<number>`coalesce(sum(${msg.outputTokens}), 0)::int`,
        errors: sql<number>`count(*) filter (where ${msg.error} is not null)::int`,
      })
      .from(msg)
      .where(eq(msg.conversationId, id)),
    db
      .select({ id: conv.id, topic: conv.topic, lastMessageAt: conv.submittedAt })
      .from(conv)
      .where(and(eq(conv.visitorId, c.visitorId), isNotNull(conv.submittedAt)))
      .orderBy(desc(conv.submittedAt))
      .limit(20),
  ]);

  if (!c.readAt) await db.update(conv).set({ readAt: new Date() }).where(eq(conv.id, id));

  return (
    <>
      <AutoRefresh seconds={15} />
      <p><Link href="/admin">← Conversations</Link></p>
      <h1 className="transcript-title">{c.topic}</h1>
      <div className="meta" style={{ marginBottom: 8 }}>
        <Link href={`/admin?view=all&visitor=${encodeURIComponent(c.handle)}`}><strong>{c.handle}</strong></Link>
        <span>started {stamp(c.createdAt)}</span>
        <span>sent {stamp(c.submittedAt)}</span>
        {c.lastMessageAt > c.submittedAt && <span>visitor kept chatting after sending</span>}
        <span>{c.messageCount} messages</span>
        <span title="input / output tokens for chat replies">{usage.inTok.toLocaleString()} / {usage.outTok.toLocaleString()} tokens</span>
        {usage.errors > 0 && <span className="badge s-blocked">{usage.errors} failed repl{usage.errors === 1 ? "y" : "ies"}</span>}
        {c.status !== "active" && <span className={`badge s-${c.status}`}>{c.status}</span>}
        {c.visitorStatus === "blocked" && <span className="badge s-blocked">visitor blocked</span>}
      </div>
      {c.status === "flagged" && c.flagReason && <p className="meta s-flagged">Flag: {c.flagReason}</p>}

      <div className="actions" style={{ marginBottom: 16 }}>
        <form action={setRead.bind(null, c.id, false)}><button>Mark unread</button></form>
        {c.status === "flagged" ? (
          <form action={setConversationStatus.bind(null, c.id, "active")}><button>Unflag</button></form>
        ) : (
          <form action={setConversationStatus.bind(null, c.id, "flagged")}><button>Flag</button></form>
        )}
        {c.status === "archived" ? (
          <form action={setConversationStatus.bind(null, c.id, "active")}><button>Move to inbox</button></form>
        ) : (
          <form action={setConversationStatus.bind(null, c.id, "archived")}><button>Archive</button></form>
        )}
        {c.visitorStatus === "blocked" ? (
          <form action={setVisitorStatus.bind(null, c.visitorId, "active")}><button>Unblock visitor</button></form>
        ) : (
          <form action={setVisitorStatus.bind(null, c.visitorId, "blocked")}><button className="danger">Block visitor</button></form>
        )}
        <form action={deleteConversation.bind(null, c.id)}><button className="danger">Delete conversation</button></form>
      </div>

      <section className="card summary-card">
        <div className="meta">
          <strong>AI summary, approved by the visitor</strong>
          {c.summaryUpdatedAt && <span>updated {ago(c.summaryUpdatedAt)}</span>}
        </div>
        {/* AI-written text, rendered as plain text. */}
        <div className="body summary-body">
          {c.summary}
        </div>
        <p className="meta shroud-note">
          The visitor&rsquo;s own words are encrypted with a key that exists only in their browser, so they can&rsquo;t be
          shown here. You see only this paraphrased summary.
        </p>
      </section>

      {others.length > 1 && (
        <div className="card" style={{ marginTop: 20 }}>
          <strong>Other conversations from {c.handle}</strong>
          <ul className="plain-list">
            {others.filter((o) => o.id !== c.id).map((o) => (
              <li key={o.id}>
                <Link href={`/admin/conversations/${o.id}`}>{o.topic}</Link> <span className="meta">{o.lastMessageAt && ago(o.lastMessageAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
