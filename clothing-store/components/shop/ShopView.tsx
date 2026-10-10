import Link from "next/link";
import { Suspense } from "react";
import Breadcrumbs, { type Crumb } from "@/components/ui/Breadcrumbs";
import ProductGrid from "@/components/shop/ProductGrid";
import ShopControls from "@/components/shop/ShopControls";
import { applyFilters, facets, inCategory, type ShopFilters } from "@/lib/catalog";
import type { Category, Product } from "@/lib/types";

type Props = {
  title: string;
  description?: string | null;
  crumbs: Crumb[];
  /** Products this page covers before filters (e.g. a whole category). */
  baseProducts: Product[];
  categories: Category[];
  filters: ShopFilters;
  basePath: string;
  /** Links shown as chips under the title (sub-categories). */
  subLinks?: { href: string; label: string; active: boolean }[];
  /** Category filter chips inside the panel (only /shop). */
  categoryOptions?: { slug: string; name: string }[];
};

export default function ShopView({ title, description, crumbs, baseProducts, categories, filters, basePath, subLinks, categoryOptions }: Props) {
  const scoped = filters.category ? inCategory(baseProducts, categories, filters.category) : baseProducts;
  const results = applyFilters(scoped, categories, filters);

  return (
    <div className="container pb-16 pt-4 md:pt-8">
      <Breadcrumbs items={crumbs} />
      <header className="mb-6 md:mb-8">
        <h1 className="text-4xl md:text-5xl">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-ink/70 md:text-lg">{description}</p>}
        {subLinks && subLinks.length > 0 && (
          <nav aria-label="Sub-categories" className="rail mt-5 md:flex-wrap">
            {subLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={l.active ? "page" : undefined}
                className={`inline-flex min-h-[48px] shrink-0 snap-start items-center rounded-full border px-5 text-[15px] font-medium transition ${
                  l.active ? "border-primary bg-primary text-canvas" : "border-surface-strong bg-surface text-ink-deep hover:border-accent"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* useSearchParams inside the controls needs a Suspense boundary */}
      <Suspense fallback={<ProductGrid products={results} clearHref={basePath} />}>
        <ShopControls facets={facets(baseProducts)} categoryOptions={categoryOptions} resultCount={results.length}>
          <ProductGrid products={results} clearHref={basePath} />
        </ShopControls>
      </Suspense>
    </div>
  );
}
