"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, { error: "" });
  return (
    <main style={{ maxWidth: 360 }}>
      <h1>Admin sign in</h1>
      <form action={action} style={{ display: "grid", gap: 10 }}>
        <input name="email" type="email" placeholder="Email" autoComplete="username" required />
        <input name="password" type="password" placeholder="Password" autoComplete="current-password" required />
        <button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        {state.error && <p className="error">{state.error}</p>}
      </form>
    </main>
  );
}
