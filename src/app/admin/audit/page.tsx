import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin";

export default async function Audit() {
  await requireAdmin();
  const rows = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      target: schema.auditLog.target,
      timestamp: schema.auditLog.timestamp,
      email: schema.admins.email,
    })
    .from(schema.auditLog)
    .innerJoin(schema.admins, eq(schema.admins.id, schema.auditLog.adminId))
    .orderBy(desc(schema.auditLog.timestamp))
    .limit(500);

  return (
    <>
      <h1>Audit log</h1>
      <div className="table-wrap">
        <table>
          <thead><tr><th>When (UTC)</th><th>Admin</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="meta">{r.timestamp.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td>{r.email}</td>
                <td>{r.action}</td>
                <td className="meta">{r.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
