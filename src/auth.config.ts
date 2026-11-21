import type { NextAuthConfig } from "next-auth";

/** Edge-safe config (no DB access) shared by middleware and the full auth setup. */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  trustHost: true, // Railway terminates TLS at its proxy.
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      // Public pages: the chat itself and sign-in.
      if (["/", "/login", "/privacy"].includes(request.nextUrl.pathname)) return true;
      return Boolean(auth?.user?.role);
    },
    jwt({ token, user }) {
      if (user) {
        token.adminId = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.adminId as string;
      session.user.role = token.role as "owner" | "moderator";
      return session;
    },
  },
} satisfies NextAuthConfig;
