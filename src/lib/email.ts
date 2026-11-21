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

const siteUrl = () => process.env.APP_URL?.replace(/\/$/, "") || null;

/* ───────────── Email design ─────────────
 * Brand tokens from design/tokens.css. Email clients (Gmail, Outlook) strip most CSS,
 * so everything is table-based with inline styles; web fonts load where supported
 * (Apple Mail, iOS) and fall back to Georgia / Helvetica / Menlo elsewhere.
 */
const C = {
  bg: "#000000", card: "#050505", raised: "#0B0A07", border: "#17140D", borderStrong: "#3A3121",
  gold: "#E2B95C", text: "#EDE6D6", body: "#D9D0BC", muted: "#B8AE98", faint: "#9C927C", warn: "#E0846B",
};
const F = {
  display: "Cinzel,'Trajan Pro',Georgia,'Times New Roman',serif",
  ui: "Inter,'Segoe UI',Helvetica,Arial,sans-serif",
  mono: "'JetBrains Mono',Menlo,Consolas,'Courier New',monospace",
  quote: "Georgia,'Times New Roman',serif",
};

type EmailContent = {
  /** Inbox preview line (hidden in the body). */
  preheader: string;
  eyebrow: string;
  title: string;
  /** Highlighted card, e.g. the owner's personal note or the AI summary. */
  card?: { label: string; text: string; italic?: boolean } | null;
  flag?: string | null;
  paragraphs?: string[];
  steps?: string[];
  /** showUrl prints a plain "or open …" fallback link under the button. */
  cta?: { label: string; url: string; showUrl?: boolean } | null;
  terminal?: string;
  footnote: string;
};

const p = (html: string, style = "") =>
  `<p style="margin:0 0 16px;font-family:${F.ui};font-size:15px;line-height:1.7;color:${C.body};${style}">${html}</p>`;

function renderHtml(e: EmailContent): string {
  const site = siteUrl();
  const logo = site
    ? `<img src="${escape(site)}/email/logo.png" width="72" height="72" alt="" style="display:block;margin:0 auto;border:0;outline:none;width:72px;height:72px">`
    : "";

  const ornament = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:18px auto 0"><tr>
<td width="56" style="border-top:1px solid ${C.borderStrong};font-size:0;line-height:0">&nbsp;</td>
<td style="padding:0 12px;font-family:${F.display};font-size:10px;line-height:10px;color:${C.gold}">&#9670;</td>
<td width="56" style="border-top:1px solid ${C.borderStrong};font-size:0;line-height:0">&nbsp;</td></tr></table>`;

  const flag = e.flag
    ? `<tr><td style="padding:0 40px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#140B08;border:1px solid #4A2A20;border-radius:8px"><tr>
<td style="padding:12px 16px;font-family:${F.ui};font-size:14px;line-height:1.6;color:${C.warn}"><strong style="letter-spacing:1px">&#9888; FLAGGED</strong>&nbsp;&nbsp;${escape(e.flag)}</td></tr></table></td></tr>`
    : "";

  const card = e.card
    ? `<tr><td style="padding:0 40px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.raised};border:1px solid ${C.borderStrong};border-left:3px solid ${C.gold};border-radius:10px"><tr>
<td style="padding:18px 22px 20px">
<div style="font-family:${F.display};font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${C.gold};margin-bottom:10px">${escape(e.card.label)}</div>
<div style="font-family:${e.card.italic ? F.quote : F.ui};font-size:${e.card.italic ? 17 : 15}px;line-height:1.7;color:${C.text};white-space:pre-wrap;${e.card.italic ? "font-style:italic;" : ""}">${e.card.italic ? "&ldquo;" : ""}${escape(e.card.text)}${e.card.italic ? "&rdquo;" : ""}</div>
</td></tr></table></td></tr>`
    : "";

  const paragraphs = (e.paragraphs ?? []).length
    ? `<tr><td style="padding:0 40px 8px">${e.paragraphs!.map((t) => p(escape(t))).join("")}</td></tr>`
    : "";

  const steps = (e.steps ?? []).length
    ? `<tr><td style="padding:4px 40px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${e
        .steps!.map(
          (t, i) => `<tr>
<td width="44" valign="top" style="padding:12px 0;border-top:1px solid ${C.border};font-family:${F.mono};font-size:13px;font-weight:700;line-height:24px;color:${C.gold}">${String(i + 1).padStart(2, "0")}</td>
<td valign="top" style="padding:12px 0;border-top:1px solid ${C.border};font-family:${F.ui};font-size:15px;line-height:24px;color:${C.body}">${escape(t)}</td></tr>`,
        )
        .join("")}</table></td></tr>`
    : "";

  // "Bulletproof" button: table cell + VML fallback so it renders as a real button in Outlook.
  const cta = e.cta
    ? `<tr><td align="center" style="padding:8px 40px 12px">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escape(e.cta.url)}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="20%" stroke="f" fillcolor="${C.gold}"><w:anchorlock/><center style="color:#000000;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escape(e.cta.label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td bgcolor="${C.gold}" style="border-radius:10px;background:${C.gold}">
<a href="${escape(e.cta.url)}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:${F.ui};font-size:16px;font-weight:600;letter-spacing:0.3px;color:#000000;text-decoration:none;border-radius:10px">${escape(e.cta.label)}&nbsp;&nbsp;&rarr;</a>
</td></tr></table><!--<![endif]-->
</td></tr>${
        e.cta.showUrl
          ? `\n<tr><td align="center" style="padding:0 40px 8px;font-family:${F.ui};font-size:12px;line-height:1.6;color:${C.faint}">or open <a href="${escape(e.cta.url)}" style="color:${C.muted};text-decoration:underline">${escape(e.cta.url.replace(/^https?:\/\//, ""))}</a></td></tr>`
          : ""
      }`
    : "";

  const terminal = e.terminal
    ? `<tr><td align="center" style="padding:20px 40px 0;font-family:${F.mono};font-size:13px;color:${C.faint}"><span style="color:${C.gold}">&#10095;</span>&nbsp;${escape(e.terminal)}<span style="color:${C.gold}">_</span></td></tr>`
    : "";

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escape(e.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Inter:wght@400;600&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0; padding:0; background:${C.bg}; }
  a { color:${C.gold}; }
  @media (max-width:620px) {
    .px { padding-left:22px !important; padding-right:22px !important; }
    .title { font-size:24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};font-size:1px;line-height:1px">${escape(e.preheader)}&#8203;&#160;&#8203;&#160;&#8203;&#160;&#8203;&#160;&#8203;&#160;&#8203;&#160;&#8203;&#160;&#8203;&#160;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg}">
<tr><td align="center" style="padding:32px 12px 40px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td style="background:${C.card};border:1px solid ${C.borderStrong};border-radius:14px;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="height:3px;line-height:3px;font-size:0;background:${C.gold}">&nbsp;</td></tr>
<tr><td align="center" style="padding:40px 40px 0">
${logo}
<div style="margin-top:${logo ? 16 : 0}px;font-family:${F.display};font-size:18px;font-weight:700;letter-spacing:7px;color:${C.gold}">${escape(APP_NAME.toUpperCase())}</div>
${ornament}
</td></tr>
<tr><td align="center" class="px" style="padding:30px 40px 6px;font-family:${F.ui};font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:${C.faint}">${escape(e.eyebrow)}</td></tr>
<tr><td align="center" class="px title" style="padding:0 40px 28px;font-family:${F.display};font-size:28px;font-weight:700;line-height:1.3;letter-spacing:0.5px;color:${C.text}">${escape(e.title)}</td></tr>
${flag}${card}${paragraphs}${steps}${cta}${terminal}
<tr><td class="px" style="padding:32px 40px 34px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.border};padding-top:18px;font-family:${F.ui};font-size:12px;line-height:1.7;color:${C.faint}">${escape(e.footnote)}</td></tr></table></td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding:20px 12px 0;font-family:${F.display};font-size:10px;font-weight:700;letter-spacing:4px;color:${C.borderStrong}">${escape(APP_NAME.toUpperCase())}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function renderText(e: EmailContent): string {
  const lines = [e.eyebrow.toUpperCase(), "", e.title, ""];
  if (e.flag) lines.push(`FLAGGED: ${e.flag}`, "");
  if (e.card) lines.push(`${e.card.label.toUpperCase()}:`, e.card.italic ? `"${e.card.text}"` : e.card.text, "");
  for (const t of e.paragraphs ?? []) lines.push(t, "");
  (e.steps ?? []).forEach((t, i) => lines.push(`${String(i + 1).padStart(2, "0")}  ${t}`));
  if (e.steps?.length) lines.push("");
  if (e.cta) lines.push(`${e.cta.label}: ${e.cta.url}`, "");
  lines.push("--", e.footnote);
  return lines.join("\n");
}

const render = (e: EmailContent) => ({ html: renderHtml(e), text: renderText(e) });

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
  const base = siteUrl();
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
  const link = dashboardLink(c.id);
  await deliver(
    subject.slice(0, 200),
    render({
      preheader: c.summary.replace(/\s+/g, " ").slice(0, 140),
      eyebrow: c.isUpdate ? "A visitor sent an update" : "A visitor sent you a message",
      title: c.topic,
      flag: c.flagged ? c.flagReason || "Needs your attention." : null,
      card: { label: "AI summary · approved by the visitor", text: c.summary },
      cta: link ? { label: "Open in dashboard", url: link } : null,
      footnote: "This summary was written by the AI and approved by the visitor before sending. Their own words are never shared with you.",
    }),
  );
}

export async function sendTestEmail() {
  const link = dashboardLink();
  return deliver(
    `${APP_NAME}: test email`,
    render({
      preheader: "Email notifications are set up and working.",
      eyebrow: "Test email",
      title: "Email is working",
      paragraphs: [
        'You\'ll get an email like this whenever a visitor presses "Send to owner". Flagged messages are marked in the subject line and at the top of the email.',
      ],
      cta: link ? { label: "Open dashboard", url: link } : null,
      footnote: "Sent from the Settings page of your dashboard.",
    }),
  );
}

/** Invite someone to chat. The link is the plain site URL: no token, so it can't be tied to their conversations. */
export async function sendInvite(to: string, note: string | null) {
  const site = siteUrl();
  return deliver(
    `You're invited to ${APP_NAME}`,
    render({
      preheader: note ? note.replace(/\s+/g, " ").slice(0, 140) : `A private AI you can talk to about anything. No account, no sign-up.`,
      eyebrow: "You're invited",
      title: "Talk anything through.",
      card: note ? { label: "A note from the owner", text: note, italic: true } : null,
      paragraphs: [`${APP_NAME} is a private AI you can talk to about anything: big questions, half-formed ideas, or something you'd like the owner to hear.`],
      steps: [
        "Open the link. No account, no sign-up, no email needed.",
        "Talk about anything. Only you can see your conversation.",
        'Want the owner to hear something? Press "Send to owner" and approve a short summary first. They never see your own words.',
      ],
      cta: site ? { label: "Start talking", url: site, showUrl: true } : null,
      terminal: "say anything",
      footnote: `You received this because the owner of ${APP_NAME} invited you. The link carries no tracking code: opening it doesn't identify you, and this invite isn't connected to anything you say.`,
    }),
    [to],
  );
}
