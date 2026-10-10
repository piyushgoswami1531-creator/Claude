import "server-only";
import type { AdminCategory, AdminProduct } from "@/lib/adminTypes";
import type { createSessionClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createSessionClient>;

const PRODUCT_FIELDS =
  "id, name, slug, description, category_id, price, sale_price, sizes, colours, in_stock, is_featured, created_at, product_images (storage_path, url, width, height, sort_order)";

type Row = Omit<AdminProduct, "images" | "price" | "sale_price"> & {
  price: number | string;
  sale_price: number | string | null;
  product_images: { storage_path: string | null; url: string; width: number | null; height: number | null; sort_order: number }[];
};

const toProduct = ({ product_images, ...p }: Row): AdminProduct => ({
  ...p,
  price: Number(p.price),
  sale_price: p.sale_price === null ? null : Number(p.sale_price),
  images: [...product_images]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({ storage_path: i.storage_path, url: i.url, width: i.width ?? 1200, height: i.height ?? 1500 })),
});

export async function getAdminProducts(supabase: Client): Promise<AdminProduct[]> {
  const { data, error } = await supabase.from("products").select(PRODUCT_FIELDS).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(toProduct);
}

export async function getAdminProduct(supabase: Client, id: string): Promise<AdminProduct | null> {
  const { data, error } = await supabase.from("products").select(PRODUCT_FIELDS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toProduct(data as Row) : null;
}

export async function getAdminCategories(supabase: Client): Promise<AdminCategory[]> {
  const { data, error } = await supabase.from("categories").select("id, parent_id, name, sort_order").eq("is_active", true).order("sort_order");
  if (error) throw new Error(error.message);
  return data;
}

export async function getPopularProducts(supabase: Client, days = 30, limit = 10) {
  const { data, error } = await supabase.rpc("popular_products", { days, max_rows: limit });
  if (error) throw new Error(error.message);
  return (data as { product_id: string; name: string; slug: string; clicks: number | string }[]).map((r) => ({ ...r, clicks: Number(r.clicks) }));
}
