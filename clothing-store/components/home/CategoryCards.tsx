import Image from "next/image";
import Link from "next/link";
import Reveal from "@/components/ui/Reveal";
import SectionHeading from "@/components/ui/SectionHeading";
import type { Category } from "@/lib/types";

export default function CategoryCards({ categories }: { categories: Category[] }) {
  return (
    <section className="section container">
      <SectionHeading eyebrow="Collections" title="Shop by Category" href="/shop" linkLabel="All products" />
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
        {categories.map((c, i) => (
          <Reveal as="li" key={c.id} delay={i * 70} className={i === 0 ? "col-span-2 md:col-span-1" : ""}>
            <Link
              href={`/shop/${c.slug}`}
              className="group relative block overflow-hidden rounded-2xl bg-surface shadow-soft transition-shadow duration-500 hover:shadow-lift"
            >
              <div className={`relative ${i === 0 ? "aspect-[2/1] md:aspect-[3/4]" : "aspect-[3/4]"}`}>
                {c.image_url && (
                  <Image
                    src={c.image_url}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 20vw, (min-width: 768px) 33vw, 50vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-deep/70 via-ink-deep/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
                  <h3 className="text-xl text-canvas md:text-2xl">{c.name}</h3>
                  {c.description && <p className="mt-0.5 line-clamp-1 text-sm text-canvas/80">{c.description}</p>}
                </div>
              </div>
            </Link>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
