"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/layout/Logo";
import { CloseIcon, MenuIcon, WhatsAppIcon } from "@/components/ui/icons";
import { siteConfig } from "@/lib/siteConfig";
import { whatsappLink } from "@/lib/whatsapp";

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the menu on navigation, and lock page scroll while it's open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // Admin has its own minimal chrome.
  if (pathname.startsWith("/admin")) return null;

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled ? "bg-canvas/85 shadow-soft backdrop-blur-md" : "bg-canvas"
      }`}
    >
      <div className="container flex h-16 items-center justify-between md:h-20">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`relative rounded-full px-4 py-3 text-[15px] font-medium transition-colors ${
                isActive(item.href) ? "text-ink-deep" : "text-ink/70 hover:text-ink-deep"
              }`}
            >
              {item.label}
              <span
                className={`absolute inset-x-4 bottom-1.5 h-px origin-left bg-primary transition-transform duration-300 ${
                  isActive(item.href) ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </Link>
          ))}
        </nav>

        <a
          href={whatsappLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-canvas shadow-soft transition hover:bg-primary-hover md:inline-flex"
        >
          <WhatsAppIcon className="h-4 w-4" /> Chat with us
        </a>

        <button
          type="button"
          className="grid h-12 w-12 place-items-center rounded-full text-ink-deep transition hover:bg-surface md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        id="mobile-menu"
        className={`fixed inset-x-0 bottom-0 top-16 z-40 bg-canvas transition-all duration-300 md:hidden ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <nav className="container flex flex-col gap-1 pt-6" aria-label="Mobile">
          {siteConfig.nav.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[56px] items-center border-b border-surface-strong/70 font-serif text-2xl transition-all duration-500 ${
                isActive(item.href) ? "text-primary" : "text-ink-deep"
              } ${open ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"}`}
              style={{ transitionDelay: open ? `${80 + i * 50}ms` : "0ms" }}
            >
              {item.label}
            </Link>
          ))}
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-primary text-base font-medium text-canvas shadow-soft"
          >
            <WhatsAppIcon className="h-5 w-5" /> Chat on WhatsApp
          </a>
        </nav>
      </div>
    </header>
  );
}
