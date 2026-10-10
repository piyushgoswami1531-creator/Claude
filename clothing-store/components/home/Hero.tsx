import Image from "next/image";
import ButtonLink from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { siteConfig } from "@/lib/siteConfig";

export default function Hero() {
  const { hero } = siteConfig;
  return (
    <section className="container pb-6 pt-4 md:pb-10 md:pt-8">
      <div className="relative overflow-hidden rounded-3xl bg-surface shadow-soft">
        <div className="grid items-center md:grid-cols-2">
          <div className="relative z-10 px-6 py-10 md:px-12 md:py-20 lg:px-16">
            <p className="eyebrow mb-4 animate-fade-up">{hero.eyebrow}</p>
            <h1 className="whitespace-pre-line text-[2.6rem] leading-[1.05] animate-fade-up [animation-delay:100ms] md:text-6xl lg:text-7xl">
              {hero.title}
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-ink/80 animate-fade-up [animation-delay:200ms] md:text-lg">
              {hero.subtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 animate-fade-up [animation-delay:300ms] sm:flex-row">
              <ButtonLink href={hero.cta.href}>
                {hero.cta.label} <ArrowRightIcon className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href={hero.secondaryCta.href} variant="outline">
                {hero.secondaryCta.label}
              </ButtonLink>
            </div>
          </div>

          <div className="relative aspect-[5/4] animate-fade-in md:aspect-auto md:h-full md:min-h-[560px]">
            <Image
              src="/placeholders/hero.svg"
              alt="Featured outfits from the new collection"
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
            {/* Soft blend into the text side on desktop */}
            <div className="absolute inset-y-0 left-0 hidden w-24 bg-gradient-to-r from-surface to-transparent md:block" />
          </div>
        </div>
      </div>
    </section>
  );
}
