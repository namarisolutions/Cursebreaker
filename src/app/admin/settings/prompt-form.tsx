"use client";

import { useActionState } from "react";
import type { SettingKey } from "@/lib/settings";
import { saveSetting } from "../actions";

export function SettingForm({
  settingKey,
  value,
  isDefault,
  canEdit,
  rows,
}: {
  settingKey: SettingKey;
  value: string;
  isDefault: boolean;
  canEdit: boolean;
  rows: number;
}) {
  const [state, action, pending] = useActionState(saveSetting.bind(null, settingKey), {});
  return (
    <form action={action}>
      <textarea name="value" rows={rows} defaultValue={value} key={value} readOnly={!canEdit} />
      {canEdit ? (
        <div className="actions">
          <button disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          {!isDefault && (
            <button name="reset" value="1" disabled={pending}>Reset to default</button>
          )}
          {state.saved && <span className="meta">Saved.</span>}
          {state.error && <span className="error">{state.error}</span>}
        </div>
      ) : (
        <p className="meta">Only owners can edit this.</p>
      )}
    </form>
  );
}
