import AdminHome from "@/components/admin/AdminHome";
import InstallPrompt from "@/components/admin/InstallPrompt";
import { requireAdmin } from "@/lib/admin";
import { getAdminCategories, getAdminProducts } from "@/lib/adminData";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const [products, categories] = await Promise.all([getAdminProducts(supabase), getAdminCategories(supabase)]);

  return (
    <AdminHome products={products} categories={categories}>
      <InstallPrompt />
    </AdminHome>
  );
}
