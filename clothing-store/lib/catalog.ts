/**
 * Pure catalogue helpers: category trees, filtering, sorting, facets.
 * Kept free of data fetching so the same logic runs on dummy data and Supabase data.
 */
import type { Category, Product } from "@/lib/types";

export const effectivePrice = (p: Product) => p.sale_price ?? p.price;

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"];
export const sortSizes = (sizes: string[]) =>
  [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, undefined, { numeric: true });
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

/** The category plus all of its sub-categories (any depth). */
export function descendantIds(categories: Category[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return ids;
}

export const SORTS = [
  { value: "featured", label: "Recommended" },
  { value: "newest", label: "Newest first" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
] as const;
export type SortValue = (typeof SORTS)[number]["value"];

export type ShopFilters = {
  category?: string; // slug
  sizes: string[];
  colours: string[];
  min?: number;
  max?: number;
  q?: string;
  featured: boolean;
  sort: SortValue;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const list = (v: string | string[] | undefined) =>
  (first(v) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const num = (v: string | string[] | undefined) => {
  const n = Number(first(v));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Reads ?category=&size=M,L&colour=Black&min=&max=&q=&featured=1&sort= */
export function parseFilters(params: RawParams): ShopFilters {
  const sort = first(params.sort);
  return {
    category: first(params.category) || undefined,
    sizes: list(params.size),
    colours: list(params.colour),
    min: num(params.min),
    max: num(params.max),
    q: first(params.q)?.trim().slice(0, 80) || undefined,
    featured: first(params.featured) === "1",
    sort: SORTS.some((s) => s.value === sort) ? (sort as SortValue) : "featured",
  };
}

function matchesSearch(p: Product, categoryName: string, q: string) {
  const haystack = [p.name, p.description ?? "", categoryName, ...p.colours].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((word) => haystack.includes(word));
}

/** Products in a category (and its sub-categories), before user filters. */
export function inCategory(products: Product[], categories: Category[], slug?: string) {
  if (!slug) return products;
  const cat = categories.find((c) => c.slug === slug);
  if (!cat) return [];
  const ids = descendantIds(categories, cat.id);
  return products.filter((p) => ids.has(p.category_id));
}

export function applyFilters(products: Product[], categories: Category[], f: ShopFilters) {
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const result = products.filter((p) => {
    const price = effectivePrice(p);
    if (f.sizes.length && !p.sizes.some((s) => f.sizes.includes(s))) return false;
    if (f.colours.length && !p.colours.some((c) => f.colours.includes(c))) return false;
    if (f.min !== undefined && price < f.min) return false;
    if (f.max !== undefined && price > f.max) return false;
    if (f.featured && !p.is_featured) return false;
    if (f.q && !matchesSearch(p, catName.get(p.category_id) ?? "", f.q)) return false;
    return true;
  });
  return sortProducts(result, f.sort);
}

export function sortProducts(products: Product[], sort: SortValue) {
  const byNewest = (a: Product, b: Product) => b.created_at.localeCompare(a.created_at);
  const compare: Record<SortValue, (a: Product, b: Product) => number> = {
    featured: (a, b) => Number(b.is_featured) - Number(a.is_featured) || byNewest(a, b),
    newest: byNewest,
    "price-asc": (a, b) => effectivePrice(a) - effectivePrice(b),
    "price-desc": (a, b) => effectivePrice(b) - effectivePrice(a),
  };
  // Sold-out items always go last.
  return [...products].sort((a, b) => Number(b.in_stock) - Number(a.in_stock) || compare[sort](a, b));
}

/** Sizes and colours that actually exist in a set of products, for the filter panel. */
export function facets(products: Product[]) {
  const sizes = new Set<string>();
  const colours = new Map<string, number>();
  for (const p of products) {
    p.sizes.forEach((s) => sizes.add(s));
    p.colours.forEach((c) => colours.set(c, (colours.get(c) ?? 0) + 1));
  }
  return {
    sizes: sortSizes([...sizes]),
    colours: [...colours.keys()].sort((a, b) => a.localeCompare(b)),
  };
}

export type Facets = ReturnType<typeof facets>;

/** Number of active filters, for the "Filters (3)" button. */
export const activeFilterCount = (f: ShopFilters) =>
  f.sizes.length + f.colours.length + (f.min || f.max ? 1 : 0) + (f.featured ? 1 : 0);
