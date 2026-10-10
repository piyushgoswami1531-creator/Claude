export type SizeChart = {
  unit: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
};

export type Category = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  size_chart?: SizeChart | null;
  sort_order: number;
};

export type ProductImage = {
  url: string;
  width: number;
  height: number;
  alt: string | null;
  sort_order: number;
};

export type Product = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  sale_price: number | null;
  sizes: string[];
  colours: string[];
  in_stock: boolean;
  is_featured: boolean;
  created_at: string;
  images: ProductImage[];
};
