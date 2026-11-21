import Link from "next/link";
import { signOut } from "@/auth";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <>
      <nav className="top">
        <Link href="/admin" className="brand">{process.env.APP_NAME ?? "Cursebreaker"}</Link>
        <Link href="/admin">Conversations</Link>
        <Link href="/admin/visitors">Visitors</Link>
        <Link href="/admin/settings">Settings</Link>
        <Link href="/admin/audit">Audit</Link>
        <Link href="/" target="_blank">View site ↗</Link>
        <span className="meta">{admin.email} · {admin.role}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button>Sign out</button>
        </form>
      </nav>
      <main>{children}</main>
    </>
  );
}
