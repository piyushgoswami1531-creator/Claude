/**
 * ─── SITE CONFIG ─────────────────────────────────────────────────
 * Every shop-specific detail lives here. Replace the [PLACEHOLDER]
 * values with the client's real details before launch.
 */
export const siteConfig = {
  name: "[SHOP NAME]",
  shortName: "[SHOP]", // used where space is tight (PWA icon label)
  tagline: "Everyday style, crafted with care",
  description:
    "[SHOP NAME] — a local clothing store for shirts, jeans, winterwear, ethnic wear and accessories. Browse online, order on WhatsApp.",

  // Logo: drop the file in /public and set the path, e.g. "/logo.png".
  // While null, the shop name is shown as a text wordmark.
  logo: null as string | null,

  // Absolute site URL, used in WhatsApp product links and SEO.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",

  contact: {
    // WhatsApp number in international format, digits only (no +, spaces or dashes).
    whatsapp: "910000000000",
    // Phone number as shown to customers, and in tel: format.
    phoneDisplay: "+91 00000 00000",
    phoneTel: "+910000000000",
    email: "[shop@email.com]",
  },

  address: {
    line1: "[Shop No., Building / Market]",
    line2: "[Street, Area]",
    city: "[City]",
    state: "[State]",
    pincode: "[000000]",
    // Google Maps → Share → Embed a map → copy the src="..." URL.
    mapEmbedUrl: "https://www.google.com/maps?q=India&output=embed",
    // Google Maps → Share → Copy link.
    mapLink: "https://maps.google.com/?q=India",
  },

  hours: [
    { days: "Monday – Saturday", time: "10:00 AM – 9:00 PM" },
    { days: "Sunday", time: "11:00 AM – 8:00 PM" },
  ],

  social: {
    instagram: "" as string, // e.g. "https://instagram.com/yourshop"
    facebook: "" as string,
  },

  currency: { code: "INR", symbol: "₹", locale: "en-IN" },

  // Home page hero banner.
  hero: {
    eyebrow: "New Season Collection",
    title: "Dress well.\nFeel at home.",
    subtitle:
      "Handpicked shirts, denim, winterwear and ethnic styles — see something you love? Order it on WhatsApp in one tap.",
    cta: { label: "Shop the collection", href: "/shop" },
    secondaryCta: { label: "Visit our store", href: "/support" },
  },

  about: {
    short:
      "[SHOP NAME] has been dressing our neighbourhood for [X] years. Every piece is chosen by hand for fit, fabric and value — come try it on, or order straight from your phone.",
    established: "[YEAR]",
  },

  // Default size chart (inches). A category can override this from the database.
  sizeChart: {
    unit: "inches",
    columns: ["Size", "Chest", "Waist", "Length"],
    rows: [
      ["S", "36–38", "28–30", "27"],
      ["M", "38–40", "30–32", "28"],
      ["L", "40–42", "32–34", "29"],
      ["XL", "42–44", "34–36", "30"],
      ["XXL", "44–46", "36–38", "31"],
    ],
  },

  sizes: ["S", "M", "L", "XL", "XXL"],

  nav: [
    { label: "Home", href: "/" },
    { label: "Shop", href: "/shop" },
    { label: "About", href: "/about" },
    { label: "Customer Support", href: "/support" },
  ],

  whatsappGreeting: "Hi! I'd like to know more about your collection.",
} as const;

export type SiteConfig = typeof siteConfig;
