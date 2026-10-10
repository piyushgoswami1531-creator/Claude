import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/admin/_actions/auth";
import { requireAdmin } from "@/lib/admin";
import { siteConfig } from "@/lib/siteConfig";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) redirect("/admin/login");
  await requireAdmin();

  return (
    <div className="min-h-[100dvh]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <header className="sticky top-0 z-40 border-b border-surface-strong bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-4">
          <Link href="/admin" className="truncate font-serif text-xl text-ink-deep">
            {siteConfig.shortName} <span className="hidden text-ink/60 min-[400px]:inline">Manager</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <Link href="/" target="_blank" className="grid h-12 place-items-center rounded-full px-4 text-base text-ink-deep hover:bg-surface">
              View shop
            </Link>
            <form action={logout}>
              <button type="submit" className="h-12 rounded-full px-4 text-base text-ink/70 hover:bg-surface">
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">{children}</main>
    </div>
  );
}
