import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, schema } from "@/db";

/**
 * Second lock behind the middleware: re-checks the admin against the DB on every
 * page render and server action, so a deleted admin loses access immediately
 * even if their JWT hasn't expired.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [admin] = await db
    .select({ id: schema.admins.id, email: schema.admins.email, role: schema.admins.role })
    .from(schema.admins)
    .where(eq(schema.admins.id, session.user.id))
    .limit(1);
  if (!admin) redirect("/login");
  return admin;
}

export async function requireOwner() {
  const admin = await requireAdmin();
  if (admin.role !== "owner") throw new Error("owner role required");
  return admin;
}

export async function audit(adminId: string, action: string, target?: string) {
  await db.insert(schema.auditLog).values({ adminId, action, target });
}
