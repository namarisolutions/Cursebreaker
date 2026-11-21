import Link from "next/link";
import { and, countDistinct, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { markAllRead } from "./actions";
import { AutoRefresh } from "./auto-refresh";
import { ago } from "./format";

const PAGE = 50;
const DAYS = 14;
const { conversations: conv, messages: msg, visitors } = schema;

// Only conversations the visitor chose to send ever appear here.
const SENT = isNotNull(conv.submittedAt);

const VIEWS = {
  inbox: { label: "Inbox", where: and(SENT, inArray(conv.status, ["active", "flagged"])) },
  unread: { label: "Unread", where: and(SENT, inArray(conv.status, ["active", "flagged"]), isNull(conv.readAt)) },
  flagged: { label: "Flagged", where: and(SENT, eq(conv.status, "flagged")) },
  archived: { label: "Archived", where: and(SENT, eq(conv.status, "archived")) },
  all: { label: "All", where: SENT },
} as const;
type View = keyof typeof VIEWS;

type Search = { view?: string; q?: string; visitor?: string; page?: string };

async function stats() {
  const startOfDay = sql`date_trunc('day', now())`;
  const [c] = await db
    .select({
      unread: sql<number>`count(*) filter (where ${conv.readAt} is null and ${conv.status} <> 'archived')::int`,
      today: sql<number>`count(*) filter (where ${conv.submittedAt} >= ${startOfDay})::int`,
      flagged: sql<number>`count(*) filter (where ${conv.status} = 'flagged')::int`,
    })
    .from(conv)
    .where(SENT);
  const [m] = await db
    .select({ today: sql<number>`count(*)::int` })
    .from(msg)
    .where(and(eq(msg.role, "user"), gte(msg.createdAt, startOfDay)));
  const [v] = await db
    .select({ n: countDistinct(conv.visitorId) })
    .from(conv)
    .where(gte(conv.lastMessageAt, sql`now() - interval '7 days'`));
  const daily = await db.execute<{ day: string; n: number }>(sql`
    select to_char(d, 'YYYY-MM-DD') as day, count(m.id)::int as n
    from generate_series(date_trunc('day', now()) - interval '${sql.raw(String(DAYS - 1))} days', date_trunc('day', now()), interval '1 day') d
    left join messages m on date_trunc('day', m.created_at) = d and m.role = 'user'
    group by d order by d`);
  return { ...c, messagesToday: m.today, visitors: v.n, daily: [...daily] };
}

function Tile({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: "accent" | "warn" }) {
  const inner = (
    <>
      <div className="tile-value" data-tone={value > 0 ? tone : undefined}>{value.toLocaleString()}</div>
      <div className="tile-label">{label}</div>
    </>
  );
  return href ? <Link href={href} className="tile">{inner}</Link> : <div className="tile">{inner}</div>;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const sp = await searchParams;
  const view: View = sp.view && sp.view in VIEWS ? (sp.view as View) : "inbox";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: (SQL | undefined)[] = [VIEWS[view].where];
  if (sp.q) {
    const pattern = `%${sp.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(or(ilike(conv.topic, pattern), ilike(conv.summary, pattern)));
  }
  if (sp.visitor) where.push(eq(visitors.handle, sp.visitor));

  const [s, rows] = await Promise.all([
    stats(),
    db
      .select({
        id: conv.id,
        topic: conv.topic,
        summary: conv.summary,
        summaryError: conv.summaryError,
        status: conv.status,
        flagReason: conv.flagReason,
        messageCount: conv.messageCount,
        readAt: conv.readAt,
        lastMessageAt: conv.lastMessageAt,
        submittedAt: conv.submittedAt,
        handle: visitors.handle,
        visitorStatus: visitors.status,
      })
      .from(conv)
      .innerJoin(visitors, eq(visitors.id, conv.visitorId))
      .where(and(...where))
      .orderBy(desc(conv.submittedAt))
      .limit(PAGE + 1)
      .offset((page - 1) * PAGE),
  ]);

  const max = Math.max(1, ...s.daily.map((d) => d.n));
  const hasMore = rows.length > PAGE;
  const href = (patch: Partial<Search>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: undefined, ...patch })) if (v) u.set(k, String(v));
    const q = u.toString();
    return q ? `/admin?${q}` : "/admin";
  };
  const filtered = Boolean(sp.q || sp.visitor);

  return (
    <>
      <AutoRefresh seconds={20} />
      <div className="dash-head">
        <h1>Conversations</h1>
        {s.unread > 0 && (
          <form action={markAllRead}>
            <button>Mark all read</button>
          </form>
        )}
      </div>

      <section className="tiles">
        <Tile label="Unread" value={s.unread} href={href({ view: "unread" })} tone="accent" />
        <Tile label="Sent today" value={s.today} />
        <Tile label="Chat messages today" value={s.messagesToday} />
        <Tile label="Flagged" value={s.flagged} href={href({ view: "flagged" })} tone="warn" />
        <Tile label="Visitors this week" value={s.visitors} href="/admin/visitors" />
      </section>

      <section className="card chart" aria-label={`Visitor messages per day, last ${DAYS} days`}>
        <div className="meta">Chat messages per day (sent or not) · last {DAYS} days</div>
        <div className="bars">
          {s.daily.map((d) => (
            <div key={d.day} className="bar" title={`${d.day}: ${d.n} message${d.n === 1 ? "" : "s"}`}>
              <div className="bar-fill" style={{ height: `${(d.n / max) * 100}%` }} />
              <span className="bar-n">{d.n || ""}</span>
            </div>
          ))}
        </div>
        <div className="bars-axis meta">
          <span>{s.daily[0]?.day.slice(5)}</span>
          <span>today</span>
        </div>
      </section>

      <nav className="tabs" aria-label="Views">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={href({ view: v === "inbox" ? undefined : v })} aria-current={v === view ? "page" : undefined} className="tab">
            {VIEWS[v].label}
            {v === "unread" && s.unread > 0 && <span className="count">{s.unread}</span>}
            {v === "flagged" && s.flagged > 0 && <span className="count warn">{s.flagged}</span>}
          </Link>
        ))}
      </nav>

      <form className="filters">
        {view !== "inbox" && <input type="hidden" name="view" value={view} />}
        <input name="q" placeholder="Search summaries" defaultValue={sp.q} />
        <input name="visitor" placeholder="Visitor" defaultValue={sp.visitor} />
        <button>Search</button>
        {filtered && <Link href={href({ q: undefined, visitor: undefined })} className="meta">clear</Link>}
      </form>

      {rows.length === 0 && (
        <div className="card empty">
          {filtered ? <p>No conversations match.</p> : view === "inbox" ? <p>No conversations have been sent to you yet. Visitors&rsquo; chats appear here only after they press &ldquo;Send to owner&rdquo;.</p> : <p>Nothing here.</p>}
        </div>
      )}

      <div className="conv-rows">
        {rows.slice(0, PAGE).map((r) => (
          <Link key={r.id} href={`/admin/conversations/${r.id}`} className={`card conv-row${r.readAt ? "" : " unread"}`}>
            <div className="meta">
              {!r.readAt && <span className="dot" aria-label="unread" />}
              <strong>{r.handle}</strong>
              <span>sent {ago(r.submittedAt!)}</span>
              <span>{r.messageCount} message{r.messageCount === 1 ? "" : "s"}</span>
              {r.status !== "active" && <span className={`badge s-${r.status}`}>{r.status}</span>}
              {r.visitorStatus === "blocked" && <span className="badge s-blocked">visitor blocked</span>}
            </div>
            <div className="conv-title">{r.topic}</div>
            {r.summary && <div className="conv-preview meta">{r.summary.replace(/\s+/g, " ").slice(0, 220)}</div>}
          </Link>
        ))}
      </div>

      <div className="pager">
        {page > 1 ? <Link href={href({ page: String(page - 1) })}>← Newer</Link> : <span />}
        {hasMore && <Link href={href({ page: String(page + 1) })}>Older →</Link>}
      </div>
    </>
  );
}
