import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EditProduct from "@/components/admin/EditProduct";
import { requireAdmin } from "@/lib/admin";
import { getAdminCategories, getAdminProduct } from "@/lib/adminData";

export const metadata: Metadata = { title: "Edit product" };
export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(params.id)) notFound();
  const [product, categories] = await Promise.all([getAdminProduct(supabase, params.id), getAdminCategories(supabase)]);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl">Edit product</h1>
      <EditProduct product={product} categories={categories} />
    </div>
  );
}
