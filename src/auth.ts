import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { verifyPassword } from "@/lib/keys";
import { rateLimit } from "@/lib/ratelimit";
import { authConfig } from "./auth.config";

const loginSchema = z.object({ email: z.email().toLowerCase(), password: z.string().min(1).max(200) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        if (!(await rateLimit(`login:${email}`, 5, 300)).ok) return null;

        const [admin] = await db.select().from(schema.admins).where(eq(schema.admins.email, email)).limit(1);
        if (!admin || !(await verifyPassword(password, admin.passwordHash))) return null;
        return { id: admin.id, email: admin.email, role: admin.role };
      },
    }),
  ],
});
