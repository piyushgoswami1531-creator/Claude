/**
 * Fills Supabase with the dummy catalogue (5 categories + sub-categories, 24 products).
 *
 *   npm run seed            # add/update dummy data (safe to re-run)
 *   npm run seed -- --reset # delete ALL products first, then seed
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Placeholder images are served from the site's /public folder, so nothing is uploaded.
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { IMAGES_PER_PRODUCT, IMAGE_SIZE, seedCategories, seedProducts } from "../lib/data/seedData";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("✗ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const reset = process.argv.includes("--reset");

function check<T>(label: string, res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error || res.data === null) {
    console.error(`✗ ${label}: ${res.error?.message ?? "no data returned"}`);
    process.exit(1);
  }
  return res.data as NonNullable<T>;
}

/** For writes that return no rows. */
function ok(label: string, res: { error: { message: string } | null }) {
  if (res.error) {
    console.error(`✗ ${label}: ${res.error.message}`);
    process.exit(1);
  }
}

async function main() {
  if (reset) {
    ok("Deleting products", await db.from("products").delete().not("id", "is", null));
    console.log("• Deleted existing products");
  }

  // Parents first, so children can point at them.
  const ids = new Map<string, string>();
  for (const pass of ["parents", "children"] as const) {
    const rows = seedCategories
      .filter((c) => (pass === "parents" ? !c.parent : c.parent))
      .map((c) => ({
        name: c.name,
        slug: c.slug,
        description: c.description,
        image_url: c.image_url,
        sort_order: c.sort_order,
        parent_id: c.parent ? ids.get(c.parent) : null,
      }));
    const saved = check("Saving categories", await db.from("categories").upsert(rows, { onConflict: "slug" }).select("id, slug"));
    saved.forEach((c) => ids.set(c.slug, c.id));
  }
  console.log(`• ${ids.size} categories`);

  const DAY = 86_400_000;
  const now = Date.now();
  const productRows = seedProducts.map((p, i) => ({
    name: p.name,
    slug: p.slug,
    category_id: ids.get(p.category)!,
    description: p.description,
    price: p.price,
    sale_price: p.sale_price ?? null,
    sizes: p.sizes,
    colours: p.colours,
    in_stock: p.in_stock ?? true,
    is_featured: p.featured ?? false,
    created_at: new Date(now - ((i * 7) % 24) * DAY).toISOString(),
  }));
  const products = check("Saving products", await db.from("products").upsert(productRows, { onConflict: "slug" }).select("id, slug"));
  console.log(`• ${products.length} products`);

  // Replace the placeholder images of seeded products (real uploads have a storage_path and are kept).
  const productIds = products.map((p) => p.id);
  ok("Clearing old placeholder images", await db.from("product_images").delete().in("product_id", productIds).is("storage_path", null));
  const images = products.flatMap((p) =>
    Array.from({ length: IMAGES_PER_PRODUCT }, (_, n) => ({
      product_id: p.id,
      url: `/placeholders/${p.slug}-${n + 1}.svg`,
      ...IMAGE_SIZE,
      alt: null,
      sort_order: n,
    })),
  );
  ok("Saving images", await db.from("product_images").insert(images));
  console.log(`• ${images.length} placeholder images`);

  console.log("✓ Seed complete. The site picks up changes within 60 seconds (or restart `npm run dev`).");
}

main();
