"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/layout/Logo";
import { InstagramIcon } from "@/components/ui/icons";
import { siteConfig } from "@/lib/siteConfig";

export default function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  const { address, contact, hours, social } = siteConfig;

  return (
    <footer className="mt-10 bg-ink-deep text-canvas/80">
      <div className="container grid gap-10 py-14 md:grid-cols-4 md:py-16">
        <div className="md:col-span-2">
          <Logo light />
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-canvas/70">{siteConfig.tagline}. Browse online, try in store, or order straight on WhatsApp.</p>
          {social.instagram && (
            <a href={social.instagram} target="_blank" rel="noopener noreferrer" className="mt-5 inline-grid h-12 w-12 place-items-center rounded-full border border-canvas/20 transition hover:bg-canvas/10" aria-label="Instagram">
              <InstagramIcon className="h-5 w-5" />
            </a>
          )}
        </div>

        <div>
          <h3 className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-accent">Visit us</h3>
          <address className="space-y-1 text-[15px] not-italic leading-relaxed">
            <p>{address.line1}</p>
            <p>{address.line2}</p>
            <p>{address.city}, {address.state} {address.pincode}</p>
            <p className="pt-2"><a href={`tel:${contact.phoneTel}`} className="hover:text-canvas">{contact.phoneDisplay}</a></p>
          </address>
        </div>

        <div>
          <h3 className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-accent">Opening hours</h3>
          <ul className="space-y-2 text-[15px]">
            {hours.map((h) => (
              <li key={h.days}><span className="block text-canvas">{h.days}</span>{h.time}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-canvas/10">
        <div className="container flex flex-col gap-3 py-6 pb-24 text-sm text-canvas/50 md:flex-row md:items-center md:justify-between md:pb-6">
          <p>© {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</p>
          <nav className="flex gap-5">
            {siteConfig.nav.slice(1).map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-canvas">{n.label}</Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
