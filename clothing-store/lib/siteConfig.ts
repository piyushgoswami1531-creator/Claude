/**
 * ─── SITE CONFIG ─────────────────────────────────────────────────
 * Every shop-specific detail lives here. Replace the [PLACEHOLDER]
 * values with the client's real details before launch.
 */
// Days a customer has to exchange an item. Used on product pages and in the FAQ.
const EXCHANGE_DAYS = 7;

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
    whatsappDisplay: "+91 00000 00000", // as shown to customers
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
    // Longer story for the /about page — one string per paragraph.
    story: [
      "[SHOP NAME] started as a small counter in [AREA] in [YEAR], with one simple idea: good clothes at honest prices, and time for every customer.",
      "Today we stock everything from everyday tees and denim to winter jackets and festive kurtas — but we still pick every piece by hand, check the stitching, and only keep what we'd wear ourselves.",
      "Most of our customers are neighbours who've been coming for years. Now you can browse the whole store from your phone and order on WhatsApp — and we'll still know your size.",
    ],
    values: [
      { title: "Handpicked", text: "Every piece is chosen in person for fabric, fit and finish. If we wouldn't wear it, we don't stock it." },
      { title: "Honest prices", text: "Fair prices on the tag, regular offers, and no hidden charges when you order on WhatsApp." },
      { title: "Personal service", text: "Not sure about a size or colour? Send us a message — a real person replies, usually within minutes." },
    ],
    // Name and role shown under the store photo. Leave empty to hide.
    owner: { name: "[OWNER NAME]", role: "Founder" },
  },

  faq: [
    {
      q: "Can I exchange an item?",
      a: `Yes. You can exchange any unworn item with its tags within ${EXCHANGE_DAYS} days of purchase. Bring it to the store with your bill, or message us on WhatsApp and we'll arrange it. Sale items and accessories can be exchanged for size only.`,
    },
    {
      q: "How do I find my size?",
      a: "Every product page has a size chart in inches. If you're between sizes, we suggest the larger one for a relaxed fit. Still unsure? Send us your usual size or chest measurement on WhatsApp and we'll recommend the right fit.",
    },
    {
      q: "How does ordering on WhatsApp work?",
      a: "Pick your size and colour, then tap \"Order on WhatsApp\". Your order details are filled in for you — just press send. We'll confirm availability and arrange store pickup or local delivery.",
    },
    {
      q: "Can I visit the store and try things on?",
      a: "Of course — trial rooms are available during opening hours. If you've seen something online, message us first and we'll keep it ready in your size.",
    },
    {
      q: "Do you deliver?",
      a: "We deliver locally within [CITY]. Delivery charges and timings depend on your area — ask us on WhatsApp when you order.",
    },
    {
      q: "How can I pay?",
      a: "Pay at the store or on delivery by cash, UPI or card. There is no online payment on this website.",
    },
  ],

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

  exchangeDays: EXCHANGE_DAYS,

  sizes: ["S", "M", "L", "XL", "XXL"],

  // Price filter options on the shop page (in rupees). Leave min or max out for open-ended.
  priceBands: [
    { max: 999 },
    { min: 1000, max: 1999 },
    { min: 2000, max: 2999 },
    { min: 3000 },
  ] as { min?: number; max?: number }[],

  nav: [
    { label: "Home", href: "/" },
    { label: "Shop", href: "/shop" },
    { label: "About", href: "/about" },
    { label: "Customer Support", href: "/support" },
  ],

  whatsappGreeting: "Hi! I'd like to know more about your collection.",
} as const;

export type SiteConfig = typeof siteConfig;
