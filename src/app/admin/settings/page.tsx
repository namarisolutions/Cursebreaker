import { requireAdmin } from "@/lib/admin";
import { chatEnabled, DEFAULTS, getSettings, MODEL } from "@/lib/settings";
import { SettingForm } from "./prompt-form";

export default async function Settings() {
  const admin = await requireAdmin();
  const s = await getSettings();
  const canEdit = admin.role === "owner";
  const checks: [string, boolean, string][] = [
    ["AI replies (ANTHROPIC_API_KEY)", chatEnabled(), `Required. Visitors can't chat without it. Model: ${MODEL}.`],
    ["Shared rate limits (REDIS_URL)", Boolean(process.env.REDIS_URL), "Needed if you run more than one replica."],
  ];

  return (
    <>
      <h1>Settings</h1>
      <div className="card">
        <strong>Status</strong>
        <div className="table-wrap">
          <table>
            <tbody>
              {checks.map(([label, ok, note]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className={ok ? undefined : "s-flagged"}>{ok ? "on" : "off"}</td>
                  <td className="meta">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <strong>AI system prompt</strong>
        <p className="meta" style={{ display: "block" }}>
          Defines who the AI is and how it talks to visitors. A fixed note is always added explaining the privacy shield (you only see summaries) so the AI can describe it honestly, and asking for plain-text replies. Changes apply to the next
          message.
        </p>
        <SettingForm settingKey="system_prompt" value={s.system_prompt} isDefault={s.system_prompt === DEFAULTS.system_prompt} canEdit={canEdit} rows={14} />
      </div>
      <div className="card">
        <strong>Summary instructions</strong>
        <p className="meta" style={{ display: "block" }}>
          What the AI should tell you about each conversation. Privacy rules are always added and can&rsquo;t be turned off
          here: it paraphrases instead of quoting, removes identifying details, honors requests to leave things out (except
          safety concerns), and flags urgent risks.
        </p>
        <SettingForm settingKey="summary_prompt" value={s.summary_prompt} isDefault={s.summary_prompt === DEFAULTS.summary_prompt} canEdit={canEdit} rows={5} />
      </div>
      <div className="card">
        <strong>Greeting</strong>
        <p className="meta" style={{ display: "block" }}>The first message visitors see. It&rsquo;s shown in the page only and isn&rsquo;t sent to the AI.</p>
        <SettingForm settingKey="greeting" value={s.greeting} isDefault={s.greeting === DEFAULTS.greeting} canEdit={canEdit} rows={3} />
      </div>
    </>
  );
}
