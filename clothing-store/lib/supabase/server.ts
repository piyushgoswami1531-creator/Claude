import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/** Supabase client acting as the logged-in user (cookie session). RLS applies. */
export function createSessionClient() {
  const cookieStore = cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session instead.
        }
      },
    },
  });
}

/** Full-access client for trusted server code only. Never import into client components. */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
