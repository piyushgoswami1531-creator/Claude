import type { Metadata } from "next";
import Image from "next/image";
import ButtonLink from "@/components/ui/Button";
import Reveal from "@/components/ui/Reveal";
import { ArrowRightIcon, WhatsAppIcon } from "@/components/ui/icons";
import { siteConfig } from "@/lib/siteConfig";
import { jsonLdString, storeJsonLd } from "@/lib/structuredData";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "About us",
  description: siteConfig.about.short,
};

export default function AboutPage() {
  const { about, address } = siteConfig;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(storeJsonLd()) }} />

      <div className="container pb-16 pt-6 md:pt-10">
        <header className="max-w-3xl animate-fade-up">
          <p className="eyebrow mb-3">Our story · Since {about.established}</p>
          <h1 className="text-4xl leading-[1.08] md:text-6xl">Clothes we&apos;d wear ourselves, from people who know your name.</h1>
        </header>

        <div className="mt-10 grid items-start gap-10 md:mt-14 md:grid-cols-2 md:gap-16">
          <Reveal>
            <figure>
              <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-surface-strong shadow-soft">
                <Image src="/placeholders/about.svg" alt={`Inside ${siteConfig.name}`} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
              </div>
              {about.owner.name && (
                <figcaption className="mt-4 text-sm text-ink/60">
                  <span className="font-medium text-ink-deep">{about.owner.name}</span> · {about.owner.role}, {siteConfig.name}
                </figcaption>
              )}
            </figure>
          </Reveal>

          <Reveal delay={100} className="space-y-5 text-base leading-relaxed text-ink/85 md:pt-2 md:text-lg">
            {about.story.map((p, i) => (
              <p key={i} className={i === 0 ? "font-serif text-xl leading-relaxed text-ink-deep md:text-2xl" : ""}>{p}</p>
            ))}
          </Reveal>
        </div>

        <section className="section !pb-0" aria-labelledby="values">
          <h2 id="values" className="sr-only">What we stand for</h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {about.values.map((v, i) => (
              <Reveal as="li" key={v.title} delay={i * 80} className="rounded-3xl border border-surface-strong bg-surface p-6 md:p-8">
                <p className="font-serif text-5xl text-accent" aria-hidden>0{i + 1}</p>
                <h3 className="mt-4 text-2xl">{v.title}</h3>
                <p className="mt-2 leading-relaxed text-ink/75">{v.text}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        <section className="section !pb-0">
          <Reveal className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-surface-strong bg-surface p-7 md:flex-row md:items-center md:p-10">
            <div>
              <h2 className="text-3xl leading-tight md:text-4xl">Come say hello.</h2>
              <p className="mt-2 text-ink/75">{address.line2}, {address.city} · Try anything on, no pressure.</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <ButtonLink href="/shop">
                Browse the shop <ArrowRightIcon className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href={whatsappLink()} external variant="outline">
                <WhatsAppIcon className="h-5 w-5" /> Message us
              </ButtonLink>
            </div>
          </Reveal>
        </section>
      </div>
    </>
  );
}
