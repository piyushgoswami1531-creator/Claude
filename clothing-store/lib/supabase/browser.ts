import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

let client: ReturnType<typeof createBrowserClient> | undefined;

/** Browser client sharing the admin's cookie session (used for photo uploads). */
export function getBrowserClient() {
  client ??= createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}
