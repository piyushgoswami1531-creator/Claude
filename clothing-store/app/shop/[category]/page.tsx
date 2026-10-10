import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ShopView from "@/components/shop/ShopView";
import type { Crumb } from "@/components/ui/Breadcrumbs";
import { parseFilters } from "@/lib/catalog";
import { getCategories, getCategoryBySlug, getProductsInCategory } from "@/lib/queries";
import { siteConfig } from "@/lib/siteConfig";

type Props = {
  params: { category: string };
  searchParams: Record<string, string | string[] | undefined>;
};

export async function generateStaticParams() {
  return (await getCategories()).map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getCategoryBySlug(params.category);
  if (!found) return {};
  const { category } = found;
  return {
    title: category.name,
    description: category.description ?? `Shop ${category.name.toLowerCase()} at ${siteConfig.name}. Order on WhatsApp.`,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const found = await getCategoryBySlug(params.category);
  if (!found) notFound();
  const { category, parent, children, siblings } = found;
  const { products, categories } = await getProductsInCategory(category.slug);

  // The category filter is the page itself, so ignore ?category= here.
  const filters = { ...parseFilters(searchParams), category: undefined };

  const crumbs: Crumb[] = [{ label: "Home", href: "/" }, { label: "Shop", href: "/shop" }];
  if (parent) crumbs.push({ label: parent.name, href: `/shop/${parent.slug}` });
  crumbs.push({ label: category.name });

  // A parent shows "All + its children"; a child shows "All <parent> + its siblings".
  const root = parent ?? category;
  const kids = parent ? siblings : children;
  const subLinks = kids.length
    ? [
        { href: `/shop/${root.slug}`, label: `All ${root.name}`, active: !parent },
        ...kids.map((c) => ({ href: `/shop/${c.slug}`, label: c.name, active: c.id === category.id })),
      ]
    : undefined;

  return (
    <ShopView
      title={category.name}
      description={category.description ?? parent?.description}
      crumbs={crumbs}
      baseProducts={products}
      categories={categories}
      filters={filters}
      basePath={`/shop/${category.slug}`}
      subLinks={subLinks}
    />
  );
}
