"use server";

import { redirect } from "next/navigation";
import { isAllowedAdminEmail } from "@/lib/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSessionClient } from "@/lib/supabase/server";

export type AuthResult = { ok: true } | { ok: false; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendLoginCode(rawEmail: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "The shop database isn't connected yet. Add the Supabase keys first." };
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, message: "Please type a full email address." };

  // Only the owner's email can even receive a code.
  if (!(await isAllowedAdminEmail(email))) {
    return { ok: false, message: "This email can't manage the shop. Please use the owner's email." };
  }

  const { error } = await createSessionClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    const wait = /rate|seconds|security purposes/i.test(error.message);
    return { ok: false, message: wait ? "Please wait a minute before asking for another code." : "Couldn't send the code. Please try again." };
  }
  return { ok: true };
}

export async function verifyLoginCode(rawEmail: string, rawCode: string): Promise<AuthResult> {
  const email = rawEmail.trim().toLowerCase();
  const token = rawCode.replace(/\D/g, "");
  if (token.length < 6) return { ok: false, message: "The code has 6 digits — please check your email." };

  const { error } = await createSessionClient().auth.verifyOtp({ email, token, type: "email" });
  if (error) return { ok: false, message: "That code didn't work. It may have expired — ask for a new one." };
  redirect("/admin");
}

export async function logout() {
  await createSessionClient().auth.signOut();
  redirect("/admin/login");
}
