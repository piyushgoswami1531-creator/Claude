import Reveal from "@/components/ui/Reveal";
import { ClockIcon, MapPinIcon, PhoneIcon, WhatsAppIcon } from "@/components/ui/icons";
import { siteConfig } from "@/lib/siteConfig";
import { whatsappLink } from "@/lib/whatsapp";

export default function ContactStrip() {
  const { contact, address, hours } = siteConfig;
  const tiles = [
    { icon: WhatsAppIcon, title: "WhatsApp", text: "Send a photo, ask for sizes, place an order.", href: whatsappLink(), cta: "Chat now", external: true },
    { icon: PhoneIcon, title: "Call us", text: contact.phoneDisplay, href: `tel:${contact.phoneTel}`, cta: "Call the store" },
    { icon: MapPinIcon, title: "Visit the store", text: `${address.line2}, ${address.city}`, href: address.mapLink, cta: "Get directions", external: true },
    { icon: ClockIcon, title: "Opening hours", text: hours.map((h) => `${h.days}: ${h.time}`).join(" · "), href: "/support", cta: "Store details" },
  ];

  return (
    <section className="section">
      <div className="container">
        <div className="rounded-3xl bg-primary px-6 py-10 text-canvas shadow-lift md:px-12 md:py-14">
          <Reveal>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-surface">We&apos;re here to help</p>
            <h2 className="max-w-xl text-3xl leading-tight text-canvas md:text-4xl">Questions about size or stock? Just ask.</h2>
          </Reveal>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map(({ icon: Icon, title, text, href, cta, external }, i) => (
              <Reveal as="li" key={title} delay={i * 80}>
                <a
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="group flex h-full min-h-[48px] flex-col rounded-2xl bg-canvas/10 p-5 transition-colors duration-300 hover:bg-canvas/20"
                >
                  <Icon className="h-6 w-6 text-surface" />
                  <p className="mt-4 font-medium text-canvas">{title}</p>
                  <p className="mt-1 flex-1 text-sm leading-relaxed text-canvas/75">{text}</p>
                  <p className="mt-4 text-sm font-medium text-canvas underline-offset-4 group-hover:underline">{cta} →</p>
                </a>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
