/** A photo as the admin form holds it. Seed placeholders have no storage_path. */
export type AdminPhoto = {
  storage_path: string | null;
  url: string;
  width: number;
  height: number;
};

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string;
  price: number;
  sale_price: number | null;
  sizes: string[];
  colours: string[];
  in_stock: boolean;
  is_featured: boolean;
  created_at: string;
  images: AdminPhoto[];
};

export type AdminCategory = { id: string; parent_id: string | null; name: string; sort_order: number };

export type ProductInput = {
  name: string;
  description: string;
  category_id: string;
  price: number;
  sale_price: number | null;
  sizes: string[];
  colours: string[];
  in_stock: boolean;
  is_featured: boolean;
  images: AdminPhoto[];
};

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };
