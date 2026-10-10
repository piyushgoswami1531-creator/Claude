import AboutStrip from "@/components/home/AboutStrip";
import CategoryCards from "@/components/home/CategoryCards";
import ContactStrip from "@/components/home/ContactStrip";
import Hero from "@/components/home/Hero";
import ProductRail from "@/components/home/ProductRail";
import { getFeatured, getNewArrivals, getTopCategories } from "@/lib/queries";

export const revalidate = 60;

export default async function HomePage() {
  const [categories, newArrivals, featured] = await Promise.all([getTopCategories(), getNewArrivals(8), getFeatured(8)]);

  return (
    <>
      <Hero />
      <CategoryCards categories={categories} />
      <ProductRail eyebrow="Just in" title="New Arrivals" href="/shop?sort=newest" products={newArrivals} tinted />
      <ProductRail eyebrow="Handpicked" title="Featured" href="/shop?featured=1" products={featured} />
      <AboutStrip />
      <ContactStrip />
    </>
  );
}
