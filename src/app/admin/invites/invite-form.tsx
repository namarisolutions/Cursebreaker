"use client";

import { useActionState } from "react";
import { sendInvites, type InviteResult } from "../actions";

export function InviteForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<InviteResult, FormData>(sendInvites, {});
  return (
    <form action={action} className="invite-form">
      <label htmlFor="emails" className="field-label">Email addresses</label>
      <textarea
        id="emails"
        name="emails"
        rows={3}
        placeholder={"friend@example.com, colleague@example.com"}
        required
        disabled={disabled}
      />
      <p className="meta">Separate addresses with commas or new lines. Up to 20 at a time.</p>

      <label htmlFor="note" className="field-label">Personal note (optional)</label>
      <textarea id="note" name="note" rows={3} maxLength={1000} placeholder="Hey! I set this up and would love your honest thoughts." disabled={disabled} />

      <div className="actions">
        <button className="btn-gold" disabled={disabled || pending}>{pending ? "Sending…" : "Send invites"}</button>
      </div>

      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.results && (
        <ul className="plain-list" role="status">
          {state.results.map((r) => (
            <li key={r.email}>
              {r.email}: {r.ok ? <span style={{ color: "var(--cb-gold)" }}>sent</span> : <span className="error">failed ({r.error})</span>}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
