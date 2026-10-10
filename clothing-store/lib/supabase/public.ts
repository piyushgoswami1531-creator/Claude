import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/** Read-only client for public catalogue data (no user session). */
export function createPublicClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
