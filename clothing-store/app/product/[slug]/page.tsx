import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductRail from "@/components/home/ProductRail";
import Gallery from "@/components/product/Gallery";
import ProductPurchase from "@/components/product/ProductPurchase";
import Breadcrumbs, { type Crumb } from "@/components/ui/Breadcrumbs";
import { effectivePrice, sortSizes } from "@/lib/catalog";
import { discountPercent, formatPrice } from "@/lib/format";
import { getProductBySlug, getProducts, getRelated } from "@/lib/queries";
import { siteConfig } from "@/lib/siteConfig";
import { jsonLdString } from "@/lib/structuredData";
import { productUrl } from "@/lib/whatsapp";

type Props = { params: { slug: string } };

export const revalidate = 60;

export async function generateStaticParams() {
  return (await getProducts()).products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getProductBySlug(params.slug);
  if (!found) return {};
  const { product } = found;
  const cover = product.images[0];
  return {
    title: product.name,
    description: product.description ?? `${product.name} — ${formatPrice(effectivePrice(product))} at ${siteConfig.name}.`,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title: product.name,
      description: product.description ?? undefined,
      images: cover && !cover.url.endsWith(".svg") ? [{ url: cover.url, width: cover.width, height: cover.height }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const found = await getProductBySlug(params.slug);
  if (!found) notFound();
  const { product, category, parent } = found;
  const related = await getRelated(product);

  const price = effectivePrice(product);
  const onSale = product.sale_price !== null;
  const isFreeSize = product.sizes.length === 1 && product.sizes[0] === "Free Size";
  const sizeChart = isFreeSize ? null : category?.size_chart ?? parent?.size_chart ?? siteConfig.sizeChart;

  const crumbs: Crumb[] = [{ label: "Shop", href: "/shop" }];
  if (parent) crumbs.push({ label: parent.name, href: `/shop/${parent.slug}` });
  if (category) crumbs.push({ label: category.name, href: `/shop/${category.slug}` });

  // Structured data so Google can show price and stock in search results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images.map((i) => (i.url.startsWith("http") ? i.url : `${siteConfig.url}${i.url}`)),
    category: category?.name,
    offers: {
      "@type": "Offer",
      price,
      priceCurrency: siteConfig.currency.code,
      availability: product.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: productUrl(product.slug),
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />

      <div className="container pb-8 pt-4 md:pt-8">
        <Breadcrumbs items={crumbs} />
        <div className="grid gap-8 md:grid-cols-2 md:gap-12 lg:gap-16">
          <Gallery images={product.images} name={product.name} />

          <div className="md:sticky md:top-28 md:self-start">
            {category && <p className="eyebrow mb-3">{category.name}</p>}
            <h1 className="text-3xl leading-tight md:text-5xl">{product.name}</h1>

            <div className="mt-4 flex flex-wrap items-baseline gap-3">
              <span className="text-2xl font-semibold text-ink-deep md:text-3xl">{formatPrice(price)}</span>
              {onSale && (
                <>
                  <span className="text-lg text-ink/50 line-through">{formatPrice(product.price)}</span>
                  <span className="rounded-full bg-primary px-2.5 py-1 text-sm font-semibold text-canvas">
                    Save {discountPercent(product.price, product.sale_price!)}%
                  </span>
                </>
              )}
            </div>
            <p className={`mt-2 text-sm font-medium ${product.in_stock ? "text-ink/70" : "text-ink-deep"}`}>
              {product.in_stock ? "● In stock — available in store" : "○ Sold out"}
            </p>

            {product.description && <p className="mt-6 text-base leading-relaxed text-ink/80 md:text-lg">{product.description}</p>}

            <div className="mt-8">
              <ProductPurchase
                name={product.name}
                slug={product.slug}
                price={price}
                sizes={sortSizes(product.sizes)}
                colours={product.colours}
                inStock={product.in_stock}
                sizeChart={sizeChart}
              />
            </div>

            <ul className="mt-8 grid gap-3 border-t border-surface-strong pt-6 text-[15px] text-ink/80">
              <li>↺ Easy exchange within {siteConfig.exchangeDays} days — see <Link href="/support" className="text-ink-deep underline underline-offset-4">store policy</Link></li>
              <li>⌂ Try it on at our store in {siteConfig.address.city}</li>
            </ul>
          </div>
        </div>
      </div>

      {related.length > 0 && <ProductRail eyebrow="You may also like" title="More like this" href={`/shop/${parent?.slug ?? category?.slug ?? ""}`} products={related} />}
      {/* Room for the sticky order bar on phones */}
      <div className="h-20 md:hidden" />
    </>
  );
}
