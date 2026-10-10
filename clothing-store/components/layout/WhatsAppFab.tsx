"use client";

import { usePathname } from "next/navigation";
import { WhatsAppIcon } from "@/components/ui/icons";
import { whatsappLink } from "@/lib/whatsapp";

export default function WhatsAppFab() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <a
      href={whatsappLink()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="group fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-primary text-canvas shadow-lift transition-all duration-300 hover:scale-105 hover:bg-primary-hover active:scale-95 md:bottom-8 md:right-8 md:h-16 md:w-16"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-20 [animation-duration:2.5s]" aria-hidden />
      <WhatsAppIcon className="relative h-7 w-7 md:h-8 md:w-8" />
      <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-full bg-ink-deep px-3 py-1.5 text-sm text-canvas opacity-0 transition-opacity group-hover:opacity-100 md:block">
        Order on WhatsApp
      </span>
    </a>
  );
}
