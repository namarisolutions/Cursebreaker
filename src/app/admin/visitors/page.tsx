import Link from "next/link";
import { desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { setVisitorStatus } from "../actions";
import { ago } from "../format";

export default async function Visitors({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q } = await searchParams;
  const { visitors, conversations } = schema;

  const rows = await db
    .select({
      id: visitors.id,
      handle: visitors.handle,
      status: visitors.status,
      createdAt: visitors.createdAt,
      lastSeenAt: visitors.lastSeenAt,
      conversations: sql<number>`count(${conversations.id})::int`,
      messages: sql<number>`coalesce(sum(${conversations.messageCount}), 0)::int`,
      flagged: sql<number>`count(${conversations.id}) filter (where ${conversations.status} = 'flagged')::int`,
    })
    .from(visitors)
    .leftJoin(conversations, eq(conversations.visitorId, visitors.id))
    .where(q ? ilike(visitors.handle, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined)
    .groupBy(visitors.id)
    .orderBy(desc(visitors.lastSeenAt))
    .limit(200);

  return (
    <>
      <h1>Visitors</h1>
      <p className="meta" style={{ display: "block" }}>
        Each visitor is an anonymous browser with a random name. Blocking stops that browser from chatting.
      </p>
      <form className="filters">
        <input name="q" placeholder="Search name" defaultValue={q} />
        <button>Search</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Visitor</th><th>Status</th><th>Conversations</th><th>Messages</th><th>Flagged</th><th>Last seen</th><th>First seen</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td><Link href={`/admin?view=all&visitor=${encodeURIComponent(v.handle)}`}>{v.handle}</Link></td>
                <td><span className={`s-${v.status}`}>{v.status}</span></td>
                <td>{v.conversations}</td>
                <td>{v.messages}</td>
                <td className={v.flagged ? "s-flagged" : undefined}>{v.flagged}</td>
                <td className="meta">{ago(v.lastSeenAt)}</td>
                <td className="meta">{v.createdAt.toISOString().slice(0, 10)}</td>
                <td>
                  {v.status === "active" ? (
                    <form action={setVisitorStatus.bind(null, v.id, "blocked")}><button className="danger">Block</button></form>
                  ) : (
                    <form action={setVisitorStatus.bind(null, v.id, "active")}><button>Unblock</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
