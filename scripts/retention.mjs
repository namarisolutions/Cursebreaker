// Data retention job. Run on a schedule as a Railway cron service:
//   start command: node scripts/retention.mjs   schedule: 0 4 * * *
// RETENTION_DAYS (default 180): conversations with no activity for this long are permanently deleted.
// AUDIT_RETENTION_DAYS (default 730): audit log entries older than this are deleted.
import postgres from "postgres";

const days = Number(process.env.RETENTION_DAYS ?? 180);
const auditDays = Number(process.env.AUDIT_RETENTION_DAYS ?? 730);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const convs = await sql`delete from conversations where last_message_at < now() - make_interval(days => ${days})`;
const visitors = await sql`delete from visitors v where not exists (select 1 from conversations c where c.visitor_id = v.id) and v.last_seen_at < now() - make_interval(days => ${days})`;
const audit = await sql`delete from audit_log where timestamp < now() - make_interval(days => ${auditDays})`;
await sql.end();
console.log(`retention: ${convs.count} conversations, ${visitors.count} visitors, ${audit.count} audit rows deleted`);
