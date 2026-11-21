"use client";

import { useActionState } from "react";
import Logo from "@/components/Logo";
import { login } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, { error: "" });
  return (
    <div className="auth">
      <Logo size={88} label="Cursebreaker logo" />
      <span className="wordmark">Cursebreaker</span>
      <form action={action}>
        <div className="label">Owner sign in</div>
        <label className="sr-only" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" placeholder="Email" autoComplete="username" required />
        <label className="sr-only" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" placeholder="Password" autoComplete="current-password" required />
        <button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        {state.error && <p className="error" role="alert">{state.error}</p>}
      </form>
    </div>
  );
}
