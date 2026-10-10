import { siteConfig } from "@/lib/siteConfig";

/** wa.me link with an optional prefilled message. */
export function whatsappLink(message: string = siteConfig.whatsappGreeting) {
  return `https://wa.me/${siteConfig.contact.whatsapp}?text=${encodeURIComponent(message)}`;
}
