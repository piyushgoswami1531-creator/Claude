import type { Metadata } from "next";
import Faq from "@/components/support/Faq";
import Reveal from "@/components/ui/Reveal";
import { ClockIcon, MapPinIcon, PhoneIcon, WhatsAppIcon } from "@/components/ui/icons";
import { siteConfig } from "@/lib/siteConfig";
import { faqJsonLd, jsonLdString, storeJsonLd } from "@/lib/structuredData";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Customer Support",
  description: `Chat with ${siteConfig.name} on WhatsApp, call us, or visit the store. Address, opening hours, exchange policy and sizing help.`,
};

export default function SupportPage() {
  const { contact, address, hours } = siteConfig;
  const fullAddress = [address.line1, address.line2, `${address.city}, ${address.state} ${address.pincode}`];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString([storeJsonLd(), faqJsonLd()]) }} />

      <div className="container pb-16 pt-6 md:pt-10">
        <header className="max-w-2xl animate-fade-up">
          <p className="eyebrow mb-3">Customer Support</p>
          <h1 className="text-4xl leading-tight md:text-6xl">How can we help?</h1>
          <p className="mt-4 text-base leading-relaxed text-ink/75 md:text-lg">
            Questions about sizes, stock or an order? The quickest way is WhatsApp — a real person at the store replies.
          </p>
        </header>

        {/* Primary actions */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 md:mt-10 md:gap-4">
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-h-[88px] items-center gap-4 rounded-3xl bg-primary px-6 py-5 text-canvas shadow-lift transition-all duration-300 hover:bg-primary-hover active:scale-[0.99]"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-canvas text-ink-deep">
              <WhatsAppIcon className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-lg font-semibold">Chat on WhatsApp</span>
              <span className="block text-sm opacity-70">{contact.whatsappDisplay}</span>
            </span>
          </a>
          <a
            href={`tel:${contact.phoneTel}`}
            className="group flex min-h-[88px] items-center gap-4 rounded-3xl border border-surface-strong bg-surface px-6 py-5 transition-all duration-300 hover:border-accent active:scale-[0.99]"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-strong text-ink-deep">
              <PhoneIcon className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-lg font-semibold text-ink-deep">Call the store</span>
              <span className="block text-sm text-ink/70">{contact.phoneDisplay}</span>
            </span>
          </a>
        </div>

        {/* Visit */}
        <section className="section !pb-0" aria-labelledby="visit">
          <Reveal className="grid gap-4 md:grid-cols-5 md:gap-6">
            <div className="flex flex-col gap-4 md:col-span-2">
              <div className="rounded-3xl border border-surface-strong bg-surface p-6 md:p-7">
                <h2 id="visit" className="flex items-center gap-3 text-2xl">
                  <MapPinIcon className="h-6 w-6 text-accent-strong" /> Visit the store
                </h2>
                <address className="mt-4 space-y-0.5 text-base not-italic leading-relaxed text-ink/85">
                  {fullAddress.map((l) => <p key={l}>{l}</p>)}
                </address>
                <a
                  href={address.mapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex min-h-[48px] items-center gap-2 rounded-full border border-surface-strong px-5 font-medium text-ink-deep transition hover:border-accent"
                >
                  Get directions →
                </a>
              </div>

              <div className="rounded-3xl border border-surface-strong bg-surface p-6 md:p-7">
                <h2 className="flex items-center gap-3 text-2xl">
                  <ClockIcon className="h-6 w-6 text-accent-strong" /> Opening hours
                </h2>
                <dl className="mt-4 divide-y divide-surface-strong text-base">
                  {hours.map((h) => (
                    <div key={h.days} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                      <dt className="text-ink/75">{h.days}</dt>
                      <dd className="font-medium text-ink-deep">{h.time}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <div className="relative min-h-[320px] overflow-hidden rounded-3xl border border-surface-strong bg-surface md:col-span-3 md:min-h-0">
              {/* Shown while the map loads */}
              <a
                href={address.mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink/70"
              >
                <MapPinIcon className="h-8 w-8 text-accent-strong" />
                <span className="font-medium text-ink-deep underline underline-offset-4">Open in Google Maps</span>
              </a>
              <iframe
                src={address.mapEmbedUrl}
                title={`Map showing ${siteConfig.name}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                className="relative h-full min-h-[320px] w-full border-0 grayscale invert-[0.9] hue-rotate-180"
              />
            </div>
          </Reveal>
        </section>

        {/* FAQ */}
        <section className="section !pb-0" aria-labelledby="faq">
          <div className="grid gap-8 md:grid-cols-5 md:gap-6">
            <Reveal className="md:col-span-2">
              <p className="eyebrow mb-3">FAQ</p>
              <h2 id="faq" className="text-3xl leading-tight md:text-4xl">Good to know</h2>
              <p className="mt-3 max-w-sm text-ink/70">Exchanges, sizing and store visits. Can&apos;t find your answer? Just message us.</p>
              <a
                href={whatsappLink("Hi! I have a question.")}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-primary px-6 font-medium text-canvas transition hover:bg-primary-hover"
              >
                <WhatsAppIcon className="h-5 w-5" /> Ask a question
              </a>
            </Reveal>
            <Reveal className="md:col-span-3" delay={100}>
              <Faq items={siteConfig.faq} />
            </Reveal>
          </div>
        </section>
      </div>
    </>
  );
}
