import ProductCard from "@/components/product/ProductCard";
import Reveal from "@/components/ui/Reveal";
import SectionHeading from "@/components/ui/SectionHeading";
import type { Product } from "@/lib/types";

/** Swipeable row on mobile, 4-column grid on desktop. */
export default function ProductRail({
  eyebrow,
  title,
  href,
  products,
  tinted = false,
}: {
  eyebrow: string;
  title: string;
  href: string;
  products: Product[];
  tinted?: boolean;
}) {
  if (products.length === 0) return null;
  return (
    <section className={`section ${tinted ? "bg-surface/60" : ""}`}>
      <div className="container">
        <SectionHeading eyebrow={eyebrow} title={title} href={href} />
        <ul className="rail md:grid md:grid-cols-4 md:gap-6 md:overflow-visible">
          {products.map((p, i) => (
            <Reveal as="li" key={p.id} delay={(i % 4) * 80} className="w-[68%] shrink-0 snap-start sm:w-[42%] md:w-auto">
              <ProductCard product={p} />
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
