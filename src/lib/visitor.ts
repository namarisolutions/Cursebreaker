import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/db";
import type { Visitor } from "@/db/schema";
import { transcriptKey } from "./crypto";
import { hashToken, newHandle } from "./keys";

const COOKIE = "cb_vid";

export type VisitorSession = { visitor: Visitor; key: Buffer };

/** The current visitor and their transcript key, from the cookie. Read-only (safe in server components). */
export async function currentVisitor(): Promise<VisitorSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [v] = await db.select().from(schema.visitors).where(eq(schema.visitors.tokenHash, hashToken(token))).limit(1);
  return v ? { visitor: v, key: transcriptKey(token, v.id) } : null;
}

/** Returns the visitor session, creating one (and its cookie) on first use. Route handlers / actions only. */
export async function getOrCreateVisitor(): Promise<VisitorSession> {
  const existing = await currentVisitor();
  if (existing) {
    await db.update(schema.visitors).set({ lastSeenAt: new Date() }).where(eq(schema.visitors.id, existing.visitor.id));
    return existing;
  }
  const token = randomBytes(32).toString("base64url");
  let visitor: Visitor | undefined;
  for (let i = 0; i < 5 && !visitor; i++) {
    [visitor] = await db
      .insert(schema.visitors)
      .values({ handle: newHandle(), tokenHash: hashToken(token) })
      .onConflictDoNothing({ target: schema.visitors.handle })
      .returning();
  }
  if (!visitor) throw new Error("could not allocate handle");
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { visitor, key: transcriptKey(token, visitor.id) };
}
