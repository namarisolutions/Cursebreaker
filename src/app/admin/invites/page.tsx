import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { canSendEmail, usingTestSender } from "@/lib/email";
import { ago } from "../format";
import { InviteForm } from "./invite-form";

export default async function Invites() {
  await requireAdmin();
  const rows = await db
    .select({
      id: schema.invites.id,
      email: schema.invites.email,
      status: schema.invites.status,
      error: schema.invites.error,
      sentAt: schema.invites.sentAt,
      by: schema.admins.email,
    })
    .from(schema.invites)
    .innerJoin(schema.admins, eq(schema.admins.id, schema.invites.sentBy))
    .orderBy(desc(schema.invites.sentAt))
    .limit(200);

  const ready = canSendEmail();
  return (
    <>
      <h1>Invites</h1>
      <div className="card">
        <strong>Invite people to chat</strong>
        <p className="meta" style={{ display: "block", margin: "8px 0 14px" }}>
          Each person gets an email with a link to your site. The link has no tracking code, so you won&rsquo;t know
          which conversations, if any, came from them. That keeps their chats anonymous.
        </p>
        {!ready && <p className="error">Email isn&rsquo;t set up yet. Add RESEND_API_KEY in Railway to send invites.</p>}
        {ready && usingTestSender() && (
          <p className="notice-warn">
            You&rsquo;re on Resend&rsquo;s test sender, which can only deliver to your own Resend login email. To invite
            other people, verify a domain you own in Resend and set NOTIFY_EMAIL_FROM to an address on it.
          </p>
        )}
        <InviteForm disabled={!ready} />
      </div>

      <div className="card">
        <strong>Sent invites</strong>
        {rows.length === 0 ? (
          <p className="meta" style={{ display: "block" }}>No invites yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Email</th><th>Status</th><th>Sent</th><th>By</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.email}</td>
                    <td className={r.status === "sent" ? undefined : "s-flagged"} title={r.error ?? undefined}>
                      {r.status}{r.error ? `: ${r.error}` : ""}
                    </td>
                    <td className="meta">{ago(r.sentAt)}</td>
                    <td className="meta">{r.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
