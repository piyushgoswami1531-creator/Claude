import AdminHome from "@/components/admin/AdminHome";
import InstallPrompt from "@/components/admin/InstallPrompt";
import PopularList from "@/components/admin/PopularList";
import { isAiEnabled, requireAdmin } from "@/lib/admin";
import { getAdminCategories, getAdminProducts, getPopularProducts } from "@/lib/adminData";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI suggestions can take a few seconds

export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const [products, categories, popular] = await Promise.all([getAdminProducts(supabase), getAdminCategories(supabase), getPopularProducts(supabase, 30)]);

  return (
    <AdminHome products={products} categories={categories} aiEnabled={isAiEnabled()}>
      <InstallPrompt />
      <PopularList rows={popular} days={30} />
    </AdminHome>
  );
}
