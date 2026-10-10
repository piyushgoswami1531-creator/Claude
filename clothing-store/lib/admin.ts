import "server-only";
import { redirect } from "next/navigation";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";

/** True if this email is in the admins table (checked with the service key, before login). */
export async function isAllowedAdminEmail(email: string) {
  const { data, error } = await createServiceClient().from("admins").select("email").eq("email", email.trim().toLowerCase()).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** The logged-in shop owner, or a redirect to the login page. */
export async function requireAdmin() {
  const supabase = createSessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  // Same check the database security rules use.
  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error) throw new Error(error.message);
  if (!isAdmin) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=not-allowed");
  }
  return { supabase, user };
}
