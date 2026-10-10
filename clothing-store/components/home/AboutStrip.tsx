import Image from "next/image";
import ButtonLink from "@/components/ui/Button";
import Reveal from "@/components/ui/Reveal";
import { siteConfig } from "@/lib/siteConfig";

export default function AboutStrip() {
  return (
    <section className="section container">
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
        <Reveal className="relative aspect-[4/3] overflow-hidden rounded-3xl shadow-soft">
          <Image src="/placeholders/about.svg" alt="Inside our store" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        </Reveal>
        <Reveal delay={120}>
          <p className="eyebrow mb-3">Our story</p>
          <h2 className="text-3xl leading-tight md:text-5xl">A neighbourhood store, now in your pocket.</h2>
          <p className="mt-5 text-base leading-relaxed text-ink/80 md:text-lg">{siteConfig.about.short}</p>
          <div className="mt-6 grid grid-cols-3 gap-4 border-y border-surface-strong py-5 text-center">
            {[
              ["Since", siteConfig.about.established],
              ["Fits", "S – XXL"],
              ["Orders", "On WhatsApp"],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="font-serif text-lg text-ink-deep md:text-xl">{v}</p>
                <p className="text-xs uppercase tracking-widest text-ink/60">{k}</p>
              </div>
            ))}
          </div>
          <ButtonLink href="/about" variant="outline" className="mt-7">
            More about us
          </ButtonLink>
        </Reveal>
      </div>
    </section>
  );
}
