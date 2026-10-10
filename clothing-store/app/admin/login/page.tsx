import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "@/app/admin/login/LoginForm";
import { siteConfig } from "@/lib/siteConfig";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Log in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  if (isSupabaseConfigured) {
    const { data: { user } } = await createSessionClient().auth.getUser();
    if (user) redirect("/admin");
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-5 py-12">
      <p className="eyebrow mb-3">{siteConfig.name}</p>
      <h1 className="mb-2 text-center text-4xl">Shop manager</h1>
      <p className="mb-8 max-w-sm text-center text-base text-ink/70">Log in with your email. No password needed — we&apos;ll send you a code.</p>
      {isSupabaseConfigured ? (
        <LoginForm initialError={searchParams.error === "not-allowed" ? "This account can't manage the shop." : undefined} />
      ) : (
        <p className="max-w-sm rounded-2xl border border-surface-strong bg-surface p-5 text-base text-ink/80">
          The shop database isn&apos;t connected yet. Add your Supabase keys to <code>.env.local</code> (see README), then reload.
        </p>
      )}
    </div>
  );
}
