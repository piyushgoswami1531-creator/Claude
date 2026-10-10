/**
 * Data access for the storefront. In this prototype step it reads the
 * dummy catalogue; step (b) switches these to Supabase with the same
 * signatures, so pages don't change.
 */
import { mockCategories, mockProducts } from "@/lib/data/seedData";
import type { Category, Product } from "@/lib/types";

export async function getTopCategories(): Promise<Category[]> {
  return mockCategories
    .filter((c) => c.parent_id === null)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function getNewArrivals(limit = 8): Promise<Product[]> {
  return [...mockProducts]
    .filter((p) => p.in_stock)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function getFeatured(limit = 8): Promise<Product[]> {
  return mockProducts.filter((p) => p.is_featured && p.in_stock).slice(0, limit);
}
