import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/queries";
import { siteConfig } from "@/lib/siteConfig";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url.replace(/\/$/, "");
  const { products, categories } = await getProducts();
  return [
    ...["", "/shop", "/about", "/support"].map((path) => ({ url: `${base}${path}`, changeFrequency: "weekly" as const })),
    ...categories.map((c) => ({ url: `${base}/shop/${c.slug}`, changeFrequency: "weekly" as const })),
    ...products.map((p) => ({ url: `${base}/product/${p.slug}`, changeFrequency: "weekly" as const })),
  ];
}
