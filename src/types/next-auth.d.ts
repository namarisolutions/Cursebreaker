import "next-auth";

type Role = "owner" | "moderator";

declare module "next-auth" {
  interface User {
    role?: Role;
  }
  interface Session {
    user: { id: string; email: string; role: Role };
  }
}
