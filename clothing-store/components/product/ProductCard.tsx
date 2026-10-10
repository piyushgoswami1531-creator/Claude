import Image from "next/image";
import Link from "next/link";
import { discountPercent, formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";

export default function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const [cover, alt] = product.images;
  const onSale = product.sale_price !== null;

  return (
    <Link href={`/product/${product.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface shadow-soft transition-shadow duration-500 group-hover:shadow-lift">
        {cover && (
          <Image
            src={cover.url}
            alt={cover.alt ?? product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            priority={priority}
          />
        )}
        {/* Second photo fades in on hover (desktop) */}
        {alt && (
          <Image
            src={alt.url}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, 33vw"
            className="hidden object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100 md:block"
          />
        )}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {onSale && (
            <span className="rounded-full bg-ink-deep/90 px-2.5 py-1 text-xs font-semibold text-canvas">
              −{discountPercent(product.price, product.sale_price!)}%
            </span>
          )}
          {!product.in_stock && (
            <span className="rounded-full bg-canvas/90 px-2.5 py-1 text-xs font-semibold text-ink">Sold out</span>
          )}
        </div>
      </div>

      <div className="mt-3 px-0.5">
        <h3 className="line-clamp-1 font-sans text-[15px] font-medium text-ink-deep md:text-base">{product.name}</h3>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-base font-semibold text-ink-deep">{formatPrice(product.sale_price ?? product.price)}</span>
          {onSale && <span className="text-sm text-ink/50 line-through">{formatPrice(product.price)}</span>}
        </p>
      </div>
    </Link>
  );
}
