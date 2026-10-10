import Link from "next/link";
import ProductCard from "@/components/product/ProductCard";
import type { Product } from "@/lib/types";

export default function ProductGrid({ products, clearHref }: { products: Product[]; clearHref: string }) {
  if (products.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-surface-strong px-6 py-16 text-center">
        <p className="font-serif text-2xl text-ink-deep">Nothing matches those filters</p>
        <p className="mx-auto mt-2 max-w-sm text-ink/70">Try fewer filters, or message us on WhatsApp — we may have it in store.</p>
        <Link href={clearHref} className="mt-6 inline-flex min-h-[48px] items-center rounded-full bg-primary px-6 font-medium text-canvas">
          Clear filters
        </Link>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3">
      {products.map((p, i) => (
        <li key={p.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <ProductCard product={p} priority={i < 4} />
        </li>
      ))}
    </ul>
  );
}
