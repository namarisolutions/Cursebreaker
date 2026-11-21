import "server-only";
import { Resend } from "resend";
import { APP_NAME } from "./settings";

/**
 * Owner notifications via Resend. Only the AI summary the visitor approved is ever
 * emailed, never the visitor's own words (those stay encrypted under their key).
 *
 * Env:
 *   RESEND_API_KEY     your Resend API key
 *   NOTIFY_EMAIL_TO    where notifications go (comma-separated for several)
 *   NOTIFY_EMAIL_FROM  a sender on a domain verified in Resend, e.g. "Cursebreaker <notify@yourdomain.com>".
 *                      Defaults to Resend's test sender, which can only deliver to your Resend account's own email.
 */

const recipients = () =>
  (process.env.NOTIFY_EMAIL_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY) && recipients().length > 0;
/** Resend is configured at all (needed for invites). */
export const canSendEmail = () => Boolean(process.env.RESEND_API_KEY);
/** Without NOTIFY_EMAIL_FROM, Resend's test sender is used: it only delivers to the Resend account's own email. */
export const usingTestSender = () => !process.env.NOTIFY_EMAIL_FROM;

let client: Resend | null = null;

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function render(opts: {
  heading: string;
  topic: string;
  summary: string;
  flagReason?: string | null;
  link?: string | null;
  linkLabel?: string;
  note?: string | null;
  footnote: string;
}) {
  const { heading, topic, summary, flagReason, link, note, footnote } = opts;
  const linkLabel = opts.linkLabel ?? "Open in dashboard";
  const text = [
    heading,
    "",
    topic,
    "",
    note ? `"${note}"\n` : "",
    summary,
    flagReason ? `\nFlag: ${flagReason}` : "",
    link ? `\n${linkLabel}: ${link}` : "",
    `\n--\n${footnote}`,
  ].join("\n");

  // Brand colors (design/tokens.css). Inline styles for email-client compatibility.
  const html = `<!doctype html><html><body style="margin:0;background:#000000;padding:24px 12px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#050505;border:1px solid #3A3121;border-radius:10px">
<tr><td style="padding:22px 24px 6px;font-family:Cinzel,Georgia,serif;font-weight:700;letter-spacing:0.2em;font-size:15px;color:#E2B95C">${escape(APP_NAME.toUpperCase())}</td></tr>
<tr><td style="padding:4px 24px 0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9C927C">${escape(heading)}</td></tr>
<tr><td style="padding:14px 24px 0;font-size:18px;font-weight:600;color:#EDE6D6">${escape(topic)}</td></tr>
${flagReason ? `<tr><td style="padding:10px 24px 0;font-size:14px;color:#E0846B">⚠️ ${escape(flagReason)}</td></tr>` : ""}
${note ? `<tr><td style="padding:14px 24px 0"><div style="border-left:2px solid #E2B95C;padding:4px 0 4px 14px;font-size:15px;line-height:1.7;color:#EDE6D6;white-space:pre-wrap">${escape(note)}</div></td></tr>` : ""}
<tr><td style="padding:12px 24px 0;font-size:15px;line-height:1.7;color:#D9D0BC;white-space:pre-wrap">${escape(summary)}</td></tr>
${link ? `<tr><td style="padding:22px 24px 0"><a href="${escape(link)}" style="display:inline-block;background:#E2B95C;color:#000000;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:8px">${escape(linkLabel)}</a></td></tr>` : ""}
<tr><td style="padding:22px 24px 22px;font-size:12px;line-height:1.6;color:#9C927C">${escape(footnote)}</td></tr>
</table></body></html>`;
  return { text, html };
}

async function deliver(
  subject: string,
  body: { text: string; html: string },
  to: string[] = recipients(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canSendEmail()) return { ok: false, error: "Email isn't configured (RESEND_API_KEY)." };
  if (to.length === 0) return { ok: false, error: "No recipient (set NOTIFY_EMAIL_TO)." };
  client ??= new Resend(process.env.RESEND_API_KEY);
  try {
    const { error } = await client.emails.send({
      from: process.env.NOTIFY_EMAIL_FROM || `${APP_NAME} <onboarding@resend.dev>`,
      to,
      subject,
      text: body.text,
      html: body.html,
    });
    if (error) {
      console.error(`resend: ${error.name}: ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error(`resend: ${(e as Error).message}`);
    return { ok: false, error: "Couldn't reach Resend." };
  }
}

const dashboardLink = (conversationId?: string) => {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  if (!base) return null;
  return conversationId ? `${base}/admin/conversations/${conversationId}` : `${base}/admin`;
};

/** Called when a visitor sends (or updates) a summary. Never throws. */
export async function notifyOwnerOfSummary(c: {
  id: string;
  topic: string;
  summary: string;
  flagged: boolean;
  flagReason: string | null;
  isUpdate: boolean;
}) {
  if (!emailEnabled()) return;
  const subject = `${c.flagged ? "⚠️ Flagged: " : c.isUpdate ? "Updated: " : "New message: "}${c.topic}`;
  await deliver(
    subject.slice(0, 200),
    render({
      heading: c.isUpdate ? "A visitor sent an update" : "A visitor sent you a message",
      topic: c.topic,
      summary: c.summary,
      flagReason: c.flagged ? c.flagReason : null,
      link: dashboardLink(c.id),
      footnote: "This is an AI summary the visitor reviewed and approved. Their own words are never shared.",
    }),
  );
}

export async function sendTestEmail() {
  return deliver(
    `${APP_NAME}: test email`,
    render({
      heading: "Test email",
      topic: "Email notifications are working",
      summary: "You'll get an email like this whenever a visitor presses \"Send to owner\". Flagged messages are marked in the subject line.",
      link: dashboardLink(),
      footnote: "Sent from the Settings page of your dashboard.",
    }),
  );
}

/** Invite someone to chat. The link is the plain site URL: no token, so it can't be tied to their conversations. */
export async function sendInvite(to: string, note: string | null) {
  const site = process.env.APP_URL?.replace(/\/$/, "") || null;
  return deliver(
    `You're invited to ${APP_NAME}`,
    render({
      heading: "You're invited",
      topic: `Talk anything through with ${APP_NAME}`,
      note,
      summary:
        `${APP_NAME} is a private AI you can talk to about anything, with no account and no sign-up. ` +
        "Only you can see your conversation. If you want to share something with the owner, you press \"Send to owner\" and approve a short AI-written summary first. They never see your own words.",
      link: site,
      linkLabel: "Start talking",
      footnote: `You received this because the owner of ${APP_NAME} invited you. Opening the link doesn't identify you, and the invite isn't connected to anything you say.`,
    }),
    [to],
  );
}
