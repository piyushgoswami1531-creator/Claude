/**
 * Storefront data. Reads from Supabase when keys are in .env.local,
 * otherwise from the dummy catalogue so the prototype works offline.
 *
 * A local shop's catalogue is small (hundreds of items), so the whole
 * catalogue is fetched once, cached, and filtered in memory. The admin
 * refreshes it with revalidateTag(CATALOG_TAG) after any change.
 */
import { unstable_cache } from "next/cache";
import { descendantIds, inCategory, sortProducts } from "@/lib/catalog";
import { mockCategories, mockProducts } from "@/lib/data/seedData";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createPublicClient } from "@/lib/supabase/public";
import type { Category, Product } from "@/lib/types";

export const CATALOG_TAG = "catalog";

type Catalog = { categories: Category[]; products: Product[] };

async function fetchFromSupabase(): Promise<Catalog> {
  const supabase = createPublicClient();
  const [cats, prods] = await Promise.all([
    supabase
      .from("categories")
      .select("id, parent_id, name, slug, description, image_url, size_chart, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("products")
      .select(
        "id, category_id, name, slug, description, price, sale_price, sizes, colours, in_stock, is_featured, created_at, product_images (url, width, height, alt, sort_order)",
      )
      .order("created_at", { ascending: false }),
  ]);
  if (cats.error) throw new Error(`Loading categories failed: ${cats.error.message}`);
  if (prods.error) throw new Error(`Loading products failed: ${prods.error.message}`);

  const categories = cats.data as Category[];
  const activeIds = new Set(categories.map((c) => c.id));

  const products: Product[] = prods.data
    .filter((p) => activeIds.has(p.category_id))
    .map(({ product_images, ...p }) => ({
      ...p,
      price: Number(p.price),
      sale_price: p.sale_price === null ? null : Number(p.sale_price),
      images: [...(product_images ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((img) => ({ ...img, width: img.width ?? 1200, height: img.height ?? 1500 })),
    }));

  return { categories, products };
}

const getCatalog = unstable_cache(
  async (): Promise<Catalog> =>
    isSupabaseConfigured ? fetchFromSupabase() : { categories: mockCategories, products: mockProducts },
  ["catalog"],
  { tags: [CATALOG_TAG], revalidate: 60 },
);

export async function getCategories() {
  return (await getCatalog()).categories;
}

export async function getTopCategories(): Promise<Category[]> {
  const { categories } = await getCatalog();
  return categories.filter((c) => c.parent_id === null).sort((a, b) => a.sort_order - b.sort_order);
}

export async function getCategoryBySlug(slug: string) {
  const { categories } = await getCatalog();
  const category = categories.find((c) => c.slug === slug);
  if (!category) return null;
  const parent = categories.find((c) => c.id === category.parent_id) ?? null;
  const children = categories.filter((c) => c.parent_id === category.id).sort((a, b) => a.sort_order - b.sort_order);
  // Sub-categories link back to the parent's siblings, so the chip row stays useful.
  const siblings = parent ? categories.filter((c) => c.parent_id === parent.id).sort((a, b) => a.sort_order - b.sort_order) : [];
  return { category, parent, children, siblings };
}

export async function getProducts() {
  return getCatalog();
}

export async function getProductsInCategory(slug?: string) {
  const { products, categories } = await getCatalog();
  return { products: inCategory(products, categories, slug), categories };
}

export async function getNewArrivals(limit = 8): Promise<Product[]> {
  const { products } = await getCatalog();
  return sortProducts(products.filter((p) => p.in_stock), "newest").slice(0, limit);
}

export async function getFeatured(limit = 8): Promise<Product[]> {
  const { products } = await getCatalog();
  return products.filter((p) => p.is_featured && p.in_stock).slice(0, limit);
}

export async function getProductBySlug(slug: string) {
  const { products, categories } = await getCatalog();
  const product = products.find((p) => p.slug === slug);
  if (!product) return null;
  const category = categories.find((c) => c.id === product.category_id) ?? null;
  const parent = categories.find((c) => c.id === category?.parent_id) ?? null;
  return { product, category, parent };
}

/** Same sub-category first, then the wider category, excluding the product itself. */
export async function getRelated(product: Product, limit = 4): Promise<Product[]> {
  const { products, categories } = await getCatalog();
  const category = categories.find((c) => c.id === product.category_id);
  const rootId = category?.parent_id ?? product.category_id;
  const family = descendantIds(categories, rootId);
  return products
    .filter((p) => p.id !== product.id && p.in_stock && family.has(p.category_id))
    .sort((a, b) => Number(b.category_id === product.category_id) - Number(a.category_id === product.category_id))
    .slice(0, limit);
}
