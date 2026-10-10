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
    <footer className="mt-10 border-t border-surface-strong bg-surface text-ink/80">
      <div className="container grid gap-10 py-14 md:grid-cols-4 md:py-16">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink/70">{siteConfig.tagline}. Browse online, try in store, or order straight on WhatsApp.</p>
          {social.instagram && (
            <a href={social.instagram} target="_blank" rel="noopener noreferrer" className="mt-5 inline-grid h-12 w-12 place-items-center rounded-full border border-surface-strong transition hover:bg-surface-strong" aria-label="Instagram">
              <InstagramIcon className="h-5 w-5" />
            </a>
          )}
        </div>

        <div>
          <h3 className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-accent-strong">Visit us</h3>
          <address className="space-y-1 text-[15px] not-italic leading-relaxed">
            <p>{address.line1}</p>
            <p>{address.line2}</p>
            <p>{address.city}, {address.state} {address.pincode}</p>
            <p className="pt-2"><a href={`tel:${contact.phoneTel}`} className="hover:text-ink-deep">{contact.phoneDisplay}</a></p>
          </address>
        </div>

        <div>
          <h3 className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-accent-strong">Opening hours</h3>
          <ul className="space-y-2 text-[15px]">
            {hours.map((h) => (
              <li key={h.days}><span className="block text-ink-deep">{h.days}</span>{h.time}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-surface-strong">
        <div className="container flex flex-col gap-3 py-6 pb-24 text-sm text-ink/50 md:flex-row md:items-center md:justify-between md:pb-6">
          <p>© {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</p>
          <nav className="flex gap-5">
            {siteConfig.nav.slice(1).map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-ink-deep">{n.label}</Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
