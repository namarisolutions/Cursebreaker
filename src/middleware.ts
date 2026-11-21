import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Every non-API page requires an admin session; `authorized` in auth.config decides.
export default NextAuth(authConfig).auth;

export const config = {
  // Public static files (favicon, email images) must bypass the admin gate.
  matcher: ["/((?!api/|_next/static|_next/image|favicon\\.ico|icon\\.svg|email/).*)"],
};
