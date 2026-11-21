"use client";

import { useState, useTransition } from "react";
import { sendTestEmailAction } from "../actions";

export function TestEmailButton({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="actions" style={{ alignItems: "center" }}>
      <button type="button" disabled={disabled || pending} onClick={() => start(async () => setResult(await sendTestEmailAction()))}>
        {pending ? "Sending…" : "Send test email"}
      </button>
      {result && (
        <span role="status" className={result.ok ? "meta" : "error"} style={{ fontSize: 13 }}>
          {result.message}
        </span>
      )}
    </div>
  );
}
