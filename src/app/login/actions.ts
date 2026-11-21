"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function login(_prev: { error: string }, form: FormData) {
  try {
    await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirectTo: "/admin",
    });
    return { error: "" };
  } catch (e) {
    // signIn throws a redirect on success; only swallow real auth failures.
    if (e instanceof AuthError) return { error: "Invalid credentials or too many attempts." };
    throw e;
  }
}
