import { supabaseUrl } from "@/lib/supabase/env";

export const PRODUCT_BUCKET = "product-images";

/** Public URL of a photo in the product bucket. */
export const publicPhotoUrl = (path: string) =>
  `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PRODUCT_BUCKET}/${path}`;

/** Paths the admin is allowed to reference: products/<uuid>.webp */
export const isValidPhotoPath = (path: string) => /^products\/[0-9a-f-]{36}\.webp$/.test(path);
