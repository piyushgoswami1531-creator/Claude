import { siteConfig } from "@/lib/siteConfig";

/** schema.org data so Google can show the shop's address, hours and phone. */
export function storeJsonLd() {
  const { address, contact } = siteConfig;
  return {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    name: siteConfig.name,
    url: siteConfig.url,
    telephone: contact.phoneTel,
    address: {
      "@type": "PostalAddress",
      streetAddress: `${address.line1}, ${address.line2}`,
      addressLocality: address.city,
      addressRegion: address.state,
      postalCode: address.pincode,
      addressCountry: "IN",
    },
    openingHours: siteConfig.hours.map((h) => `${h.days}: ${h.time}`),
    ...(siteConfig.logo ? { logo: `${siteConfig.url}${siteConfig.logo}` } : {}),
  };
}

export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: siteConfig.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** Safe to drop into <script type="application/ld+json">. */
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
