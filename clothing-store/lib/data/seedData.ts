/**
 * Dummy catalogue for the prototype. Used directly by the site until
 * Supabase is connected, and by the seed script to fill the database.
 * Images are generated placeholders in /public/placeholders.
 */
import type { Category, Product } from "@/lib/types";

// Silhouette used by scripts/generate-placeholders.mjs for each product image.
export type Shape =
  | "shirt" | "tee" | "jeans" | "trousers" | "jacket" | "sweater"
  | "hoodie" | "kurta" | "vest" | "belt" | "bag" | "cap";

type SeedCategory = Omit<Category, "id" | "parent_id"> & { parent: string | null; shape: Shape };

export const seedCategories: SeedCategory[] = [
  { name: "Topwear", slug: "topwear", parent: null, shape: "shirt", sort_order: 1,
    description: "Shirts and t-shirts for every day", image_url: "/placeholders/category-topwear.svg" },
  { name: "Shirts", slug: "shirts", parent: "topwear", shape: "shirt", sort_order: 1, description: null, image_url: null },
  { name: "T-Shirts", slug: "t-shirts", parent: "topwear", shape: "tee", sort_order: 2, description: null, image_url: null },

  { name: "Bottomwear", slug: "bottomwear", parent: null, shape: "jeans", sort_order: 2,
    description: "Denim, chinos and trousers", image_url: "/placeholders/category-bottomwear.svg" },
  { name: "Jeans", slug: "jeans", parent: "bottomwear", shape: "jeans", sort_order: 1, description: null, image_url: null },
  { name: "Trousers", slug: "trousers", parent: "bottomwear", shape: "trousers", sort_order: 2, description: null, image_url: null },

  { name: "Winterwear", slug: "winterwear", parent: null, shape: "hoodie", sort_order: 3,
    description: "Jackets, sweaters and hoodies", image_url: "/placeholders/category-winterwear.svg" },
  { name: "Jackets", slug: "jackets", parent: "winterwear", shape: "jacket", sort_order: 1, description: null, image_url: null },
  { name: "Sweaters", slug: "sweaters", parent: "winterwear", shape: "sweater", sort_order: 2, description: null, image_url: null },
  { name: "Hoodies", slug: "hoodies", parent: "winterwear", shape: "hoodie", sort_order: 3, description: null, image_url: null },

  { name: "Ethnic Wear", slug: "ethnic-wear", parent: null, shape: "kurta", sort_order: 4,
    description: "Kurtas and festive styles", image_url: "/placeholders/category-ethnic-wear.svg" },

  { name: "Accessories", slug: "accessories", parent: null, shape: "bag", sort_order: 5,
    description: "Belts, bags and caps", image_url: "/placeholders/category-accessories.svg" },
];

type SeedProduct = {
  name: string;
  slug: string;
  category: string; // category slug
  shape: Shape;
  description: string;
  price: number;
  sale_price?: number;
  sizes: string[];
  colours: string[];
  featured?: boolean;
  in_stock?: boolean;
};

const ALL = ["S", "M", "L", "XL", "XXL"];
const WAIST = ["S", "M", "L", "XL"];
const FREE = ["Free Size"];

export const seedProducts: SeedProduct[] = [
  { name: "Classic Oxford Shirt", slug: "classic-oxford-shirt", category: "shirts", shape: "shirt",
    description: "A wardrobe essential in soft, breathable Oxford cotton with a button-down collar. Smart enough for work, easy enough for weekends.",
    price: 1499, sale_price: 1199, sizes: ALL, colours: ["Sand", "White", "Sky Blue"], featured: true },
  { name: "Linen Blend Casual Shirt", slug: "linen-blend-casual-shirt", category: "shirts", shape: "shirt",
    description: "Lightweight linen-cotton blend that stays cool in the heat. Relaxed fit with a soft, lived-in texture.",
    price: 1799, sizes: ALL, colours: ["Beige", "Olive"] },
  { name: "Checked Flannel Shirt", slug: "checked-flannel-shirt", category: "shirts", shape: "shirt",
    description: "Brushed cotton flannel in a classic check. Wear it buttoned up or open over a tee.",
    price: 1299, sizes: ["M", "L", "XL"], colours: ["Brown", "Maroon"] },

  { name: "Essential Crew Tee", slug: "essential-crew-tee", category: "t-shirts", shape: "tee",
    description: "100% combed cotton, pre-shrunk, with a clean crew neck. The tee you will reach for every day.",
    price: 599, sale_price: 449, sizes: ALL, colours: ["Mocha", "Black", "White", "Grey"] },
  { name: "Heavyweight Oversized Tee", slug: "heavyweight-oversized-tee", category: "t-shirts", shape: "tee",
    description: "Thick 240 GSM cotton with dropped shoulders and a boxy, oversized fit.",
    price: 899, sizes: ALL, colours: ["Sand", "Charcoal"], featured: true },
  { name: "Henley Long-Sleeve Tee", slug: "henley-long-sleeve-tee", category: "t-shirts", shape: "sweater",
    description: "Ribbed cotton henley with a three-button placket. Layers perfectly under jackets.",
    price: 799, sizes: ["S", "M", "L", "XL"], colours: ["Cream", "Brown"] },

  { name: "Slim Fit Indigo Jeans", slug: "slim-fit-indigo-jeans", category: "jeans", shape: "jeans",
    description: "Stretch denim in a deep indigo wash. Slim through the thigh with a tapered leg.",
    price: 1999, sale_price: 1599, sizes: WAIST, colours: ["Indigo", "Light Blue"], featured: true },
  { name: "Relaxed Straight Jeans", slug: "relaxed-straight-jeans", category: "jeans", shape: "jeans",
    description: "A comfortable straight cut in rigid cotton denim that softens with every wear.",
    price: 2199, sizes: WAIST, colours: ["Mid Blue"] },
  { name: "Washed Black Jeans", slug: "washed-black-jeans", category: "jeans", shape: "jeans",
    description: "Faded black denim with a touch of stretch. Goes with absolutely everything.",
    price: 1899, sizes: ALL, colours: ["Black"], in_stock: false },

  { name: "Pleated Chino Trousers", slug: "pleated-chino-trousers", category: "trousers", shape: "trousers",
    description: "Cotton twill chinos with a single front pleat and a relaxed, tapered leg.",
    price: 1599, sizes: WAIST, colours: ["Khaki", "Olive", "Navy"] },
  { name: "Tailored Formal Trousers", slug: "tailored-formal-trousers", category: "trousers", shape: "trousers",
    description: "Sharp, crease-resistant trousers for the office and occasions. Flat front, slim fit.",
    price: 1899, sizes: WAIST, colours: ["Charcoal", "Beige"], featured: true },
  { name: "Cotton Cargo Pants", slug: "cotton-cargo-pants", category: "trousers", shape: "trousers",
    description: "Utility cargos in soft cotton with roomy side pockets and an elastic-back waist.",
    price: 1699, sale_price: 1399, sizes: ALL, colours: ["Olive", "Sand"] },

  { name: "Suede Trucker Jacket", slug: "suede-trucker-jacket", category: "jackets", shape: "jacket",
    description: "Faux-suede trucker jacket with a warm sherpa collar. A statement layer for cool evenings.",
    price: 3999, sale_price: 3299, sizes: ["M", "L", "XL"], colours: ["Tan", "Brown"], featured: true },
  { name: "Quilted Puffer Jacket", slug: "quilted-puffer-jacket", category: "jackets", shape: "jacket",
    description: "Lightweight, packable puffer with water-resistant shell. Warm without the bulk.",
    price: 3499, sizes: ALL, colours: ["Black", "Olive"] },

  { name: "Cable Knit Sweater", slug: "cable-knit-sweater", category: "sweaters", shape: "sweater",
    description: "Chunky cable-knit pullover in a soft acrylic-wool blend. Cosy, classic, timeless.",
    price: 2299, sizes: ["S", "M", "L", "XL"], colours: ["Cream", "Camel"] },
  { name: "Merino Crew Sweater", slug: "merino-crew-sweater", category: "sweaters", shape: "sweater",
    description: "Fine-gauge merino wool that is warm, breathable and never itchy.",
    price: 2499, sizes: ALL, colours: ["Mocha", "Grey"] },

  { name: "Fleece Pullover Hoodie", slug: "fleece-pullover-hoodie", category: "hoodies", shape: "hoodie",
    description: "Brushed-back fleece hoodie with a kangaroo pocket and ribbed cuffs.",
    price: 1799, sale_price: 1499, sizes: ALL, colours: ["Sand", "Black", "Brown"], featured: true },
  { name: "Zip-Up Hoodie", slug: "zip-up-hoodie", category: "hoodies", shape: "hoodie",
    description: "Full-zip cotton hoodie — easy to layer, easy to wear.",
    price: 1999, sizes: ["M", "L", "XL", "XXL"], colours: ["Charcoal"] },

  { name: "Cotton Straight Kurta", slug: "cotton-straight-kurta", category: "ethnic-wear", shape: "kurta",
    description: "Breathable pure cotton kurta with a mandarin collar. Perfect for daily wear and pujas.",
    price: 1299, sizes: ALL, colours: ["White", "Beige", "Mustard"] },
  { name: "Silk Blend Festive Kurta", slug: "silk-blend-festive-kurta", category: "ethnic-wear", shape: "kurta",
    description: "Rich silk-blend kurta with subtle self-weave. Made for weddings and festivals.",
    price: 2999, sale_price: 2499, sizes: ALL, colours: ["Gold", "Maroon"], featured: true },
  { name: "Classic Nehru Jacket", slug: "classic-nehru-jacket", category: "ethnic-wear", shape: "vest",
    description: "Tailored Nehru jacket to layer over a kurta or shirt for an instant festive look.",
    price: 2199, sizes: ["M", "L", "XL"], colours: ["Beige", "Navy"] },

  { name: "Genuine Leather Belt", slug: "genuine-leather-belt", category: "accessories", shape: "belt",
    description: "Full-grain leather belt with a brushed metal buckle. Ages beautifully.",
    price: 799, sizes: FREE, colours: ["Brown", "Black"] },
  { name: "Canvas Tote Bag", slug: "canvas-tote-bag", category: "accessories", shape: "bag",
    description: "Heavy cotton canvas tote with an inner pocket. Big enough for everything.",
    price: 999, sizes: FREE, colours: ["Natural", "Mocha"] },
  { name: "Wool Blend Cap", slug: "wool-blend-cap", category: "accessories", shape: "cap",
    description: "Six-panel cap in a warm wool blend with an adjustable strap.",
    price: 599, sizes: FREE, colours: ["Camel", "Charcoal"] },
];

/** Number of placeholder images generated per product. */
export const IMAGES_PER_PRODUCT = 3;
export const IMAGE_SIZE = { width: 800, height: 1000 };

// ─── Build typed objects the site can use without a database ───

export const mockCategories: Category[] = seedCategories.map((c) => ({
  id: `cat-${c.slug}`,
  parent_id: c.parent ? `cat-${c.parent}` : null,
  name: c.name,
  slug: c.slug,
  description: c.description,
  image_url: c.image_url,
  sort_order: c.sort_order,
}));

const DAY = 24 * 60 * 60 * 1000;
const BASE_DATE = Date.UTC(2026, 9, 1);

export const mockProducts: Product[] = seedProducts.map((p, i) => ({
  id: `prod-${p.slug}`,
  category_id: `cat-${p.category}`,
  name: p.name,
  slug: p.slug,
  description: p.description,
  price: p.price,
  sale_price: p.sale_price ?? null,
  sizes: p.sizes,
  colours: p.colours,
  in_stock: p.in_stock ?? true,
  is_featured: p.featured ?? false,
  // Spread creation dates so "New Arrivals" has a stable order.
  created_at: new Date(BASE_DATE - ((i * 7) % 24) * DAY).toISOString(),
  images: Array.from({ length: IMAGES_PER_PRODUCT }, (_, n) => ({
    url: `/placeholders/${p.slug}-${n + 1}.svg`,
    ...IMAGE_SIZE,
    alt: `${p.name} — photo ${n + 1}`,
    sort_order: n,
  })),
}));
