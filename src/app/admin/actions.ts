"use server";

import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit, requireAdmin, requireOwner } from "@/lib/admin";
import { sendTestEmail } from "@/lib/email";
import { DEFAULTS, type SettingKey } from "@/lib/settings";

const id = z.uuid();
const convStatus = z.enum(["active", "flagged", "archived"]);
const visitorStatus = z.enum(["active", "blocked"]);

export async function setRead(conversationId: string, read: boolean) {
  await requireAdmin();
  await db
    .update(schema.conversations)
    .set({ readAt: read ? new Date() : null })
    .where(eq(schema.conversations.id, id.parse(conversationId)));
  revalidatePath("/admin", "layout");
}

export async function markAllRead() {
  await requireAdmin();
  await db.update(schema.conversations).set({ readAt: new Date() }).where(isNull(schema.conversations.readAt));
  revalidatePath("/admin", "layout");
}

export async function setConversationStatus(conversationId: string, status: string) {
  const admin = await requireAdmin();
  const cid = id.parse(conversationId);
  const s = convStatus.parse(status);
  await db
    .update(schema.conversations)
    .set({ status: s, ...(s === "active" ? { flagReason: null } : {}), ...(s === "flagged" ? { flagReason: "flagged by admin" } : {}) })
    .where(eq(schema.conversations.id, cid));
  await audit(admin.id, `conversation.${s}`, cid);
  revalidatePath("/admin", "layout");
}

export async function deleteConversation(conversationId: string) {
  const admin = await requireAdmin();
  const cid = id.parse(conversationId);
  await db.delete(schema.conversations).where(eq(schema.conversations.id, cid));
  await audit(admin.id, "conversation.delete", cid);
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function setVisitorStatus(visitorId: string, status: string) {
  const admin = await requireAdmin();
  const vid = id.parse(visitorId);
  const s = visitorStatus.parse(status);
  const [v] = await db
    .update(schema.visitors)
    .set({ status: s })
    .where(eq(schema.visitors.id, vid))
    .returning({ handle: schema.visitors.handle });
  if (v) await audit(admin.id, `visitor.${s === "blocked" ? "block" : "unblock"}`, v.handle);
  revalidatePath("/admin", "layout");
}

export async function saveSetting(
  key: SettingKey,
  _prev: { saved?: boolean; error?: string },
  form: FormData,
): Promise<{ saved?: boolean; error?: string }> {
  const admin = await requireOwner();
  if (!(key in DEFAULTS)) return { error: "Unknown setting." };
  if (form.get("reset")) {
    await db.delete(schema.settings).where(eq(schema.settings.key, key));
  } else {
    const value = String(form.get("value") ?? "").trim();
    if (value.length < 1 || value.length > 20_000) return { error: "Must be 1 to 20,000 characters." };
    await db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
  }
  await audit(admin.id, form.get("reset") ? `settings.${key}.reset` : `settings.${key}.update`);
  revalidatePath("/admin/settings");
  return { saved: true };
}

export async function sendTestEmailAction(): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  const result = await sendTestEmail();
  await audit(admin.id, "settings.email_test", result.ok ? "sent" : "failed");
  return result.ok
    ? { ok: true, message: "Test email sent. Check your inbox (and spam folder)." }
    : { ok: false, message: result.error };
}
