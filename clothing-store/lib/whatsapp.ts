import { siteConfig } from "@/lib/siteConfig";

/** wa.me link with an optional prefilled message. */
export function whatsappLink(message: string = siteConfig.whatsappGreeting) {
  return `https://wa.me/${siteConfig.contact.whatsapp}?text=${encodeURIComponent(message)}`;
}

export const productUrl = (slug: string) => `${siteConfig.url.replace(/\/$/, "")}/product/${slug}`;

/** The message a customer sends when tapping "Order on WhatsApp". */
export function orderMessage(o: { name: string; size?: string | null; colour?: string | null; price: string; slug: string; inStock: boolean }) {
  const lines = [
    o.inStock ? "Hi! I'd like to order this:" : "Hi! Will this be back in stock?",
    "",
    `*${o.name}*`,
    o.size ? `Size: ${o.size}` : null,
    o.colour ? `Colour: ${o.colour}` : null,
    `Price: ${o.price}`,
    "",
    productUrl(o.slug),
  ];
  return lines.filter((l) => l !== null).join("\n");
}
