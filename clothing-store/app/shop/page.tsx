import type { Metadata } from "next";
import ShopView from "@/components/shop/ShopView";
import { parseFilters } from "@/lib/catalog";
import { getProducts } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Shop all",
  description: "Browse every shirt, tee, jean, jacket, kurta and accessory in store. Order on WhatsApp.",
};

type Props = { searchParams: Record<string, string | string[] | undefined> };

export default async function ShopPage({ searchParams }: Props) {
  const filters = parseFilters(searchParams);
  const { products, categories } = await getProducts();
  const top = categories.filter((c) => c.parent_id === null).sort((a, b) => a.sort_order - b.sort_order);

  const chosen = top.find((c) => c.slug === filters.category);
  const title = filters.q
    ? `Results for “${filters.q}”`
    : chosen?.name ?? (filters.featured ? "Featured" : filters.sort === "newest" ? "New Arrivals" : "Shop all");

  return (
    <ShopView
      title={title}
      description="Everything in store right now. Tap any item to see sizes and order on WhatsApp."
      crumbs={[{ label: "Home", href: "/" }, { label: "Shop" }]}
      baseProducts={products}
      categories={categories}
      filters={filters}
      basePath="/shop"
      categoryOptions={top.map((c) => ({ slug: c.slug, name: c.name }))}
    />
  );
}
