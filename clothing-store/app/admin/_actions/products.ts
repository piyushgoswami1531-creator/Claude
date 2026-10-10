"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import type { ActionResult, AdminPhoto, ProductInput } from "@/lib/adminTypes";
import { slugify } from "@/lib/format";
import { CATALOG_TAG } from "@/lib/queries";
import { PRODUCT_BUCKET, isValidPhotoPath, publicPhotoUrl } from "@/lib/storage";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

function refreshSite(slug?: string) {
  revalidateTag(CATALOG_TAG);
  revalidatePath("/admin");
  if (slug) revalidatePath(`/product/${slug}`);
}

const clean = (list: unknown, max: number) =>
  Array.isArray(list) ? [...new Set(list.map((s) => String(s).trim()).filter(Boolean))].slice(0, max) : [];

/** Never trust photo URLs from the browser: rebuild them from the storage path. */
function cleanPhotos(images: AdminPhoto[]): AdminPhoto[] | null {
  const out: AdminPhoto[] = [];
  for (const img of images.slice(0, 10)) {
    const width = Math.round(Number(img.width)) || 1200;
    const height = Math.round(Number(img.height)) || 1500;
    if (img.storage_path) {
      if (!isValidPhotoPath(img.storage_path)) return null;
      out.push({ storage_path: img.storage_path, url: publicPhotoUrl(img.storage_path), width, height });
    } else if (/^\/placeholders\/[a-z0-9-]+\.svg$/.test(img.url)) {
      out.push({ storage_path: null, url: img.url, width, height }); // seed placeholder
    } else {
      return null;
    }
  }
  return out;
}

function validate(input: ProductInput): { ok: true; value: ProductInput } | { ok: false; message: string } {
  const name = String(input.name ?? "").trim().slice(0, 120);
  const price = Math.round(Number(input.price) * 100) / 100;
  const sale = input.sale_price === null || input.sale_price === undefined || String(input.sale_price) === "" ? null : Math.round(Number(input.sale_price) * 100) / 100;
  const images = cleanPhotos(Array.isArray(input.images) ? input.images : []);

  if (!images) return { ok: false, message: "One of the photos is invalid. Please remove it and add it again." };
  if (images.length === 0) return { ok: false, message: "Please add at least one photo." };
  if (!name) return { ok: false, message: "Please give the product a name." };
  if (!input.category_id) return { ok: false, message: "Please choose a category." };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, message: "Please enter the price." };
  if (sale !== null && (!Number.isFinite(sale) || sale <= 0 || sale >= price)) {
    return { ok: false, message: "The offer price must be lower than the normal price." };
  }
  const sizes = clean(input.sizes, 12);
  if (sizes.length === 0) return { ok: false, message: "Please tap at least one size." };

  return {
    ok: true,
    value: {
      name,
      description: String(input.description ?? "").trim().slice(0, 2000),
      category_id: String(input.category_id),
      price,
      sale_price: sale,
      sizes,
      colours: clean(input.colours, 12),
      in_stock: Boolean(input.in_stock),
      is_featured: Boolean(input.is_featured),
      images,
    },
  };
}

async function uniqueSlug(supabase: Supabase, name: string, ignoreId?: string) {
  const base = slugify(name);
  const { data } = await supabase.from("products").select("id, slug").like("slug", `${base}%`);
  const taken = new Set((data ?? []).filter((r) => r.id !== ignoreId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

async function replaceImages(supabase: Supabase, productId: string, images: AdminPhoto[]) {
  // One transaction in the database; returns photo files that are no longer used.
  const { data: unused, error } = await supabase.rpc("replace_product_images", { p_product_id: productId, p_images: images });
  if (error) throw new Error(error.message);
  const paths = (unused as string[] | null) ?? [];
  if (paths.length) await supabase.storage.from(PRODUCT_BUCKET).remove(paths);
}

export async function saveProduct(input: ProductInput, id?: string): Promise<ActionResult<{ id: string; slug: string }>> {
  const { supabase } = await requireAdmin();
  const v = validate(input);
  if (!v.ok) return v;
  const { images, ...fields } = v.value;

  try {
    if (id) {
      const { data: current } = await supabase.from("products").select("name, slug").eq("id", id).maybeSingle();
      if (!current) return { ok: false, message: "This product no longer exists." };
      // Keep the link stable unless the name changed.
      const slug = current.name === fields.name ? current.slug : await uniqueSlug(supabase, fields.name, id);
      const { error } = await supabase.from("products").update({ ...fields, slug }).eq("id", id);
      if (error) throw new Error(error.message);
      await replaceImages(supabase, id, images);
      refreshSite(current.slug);
      if (slug !== current.slug) revalidatePath(`/product/${slug}`);
      return { ok: true, data: { id, slug } };
    }

    const slug = await uniqueSlug(supabase, fields.name);
    const { data, error } = await supabase.from("products").insert({ ...fields, slug }).select("id").single();
    if (error) throw new Error(error.message);
    try {
      await replaceImages(supabase, data.id, images);
    } catch (e) {
      await supabase.from("products").delete().eq("id", data.id); // don't leave a product without photos
      throw e;
    }
    refreshSite(slug);
    return { ok: true, data: { id: data.id, slug } };
  } catch (e) {
    console.error("saveProduct failed", e);
    return { ok: false, message: "Couldn't save. Please check your internet and try again." };
  }
}

export async function setProductFlag(id: string, field: "in_stock" | "is_featured", value: boolean): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  if (field !== "in_stock" && field !== "is_featured") return { ok: false, message: "Unknown setting." };
  const { data, error } = await supabase.from("products").update({ [field]: value }).eq("id", id).select("slug").maybeSingle();
  if (error || !data) return { ok: false, message: "Couldn't update. Please try again." };
  refreshSite(data.slug);
  return { ok: true, data: undefined };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const { data: images } = await supabase.from("product_images").select("storage_path").eq("product_id", id);
  const { data, error } = await supabase.from("products").delete().eq("id", id).select("slug").maybeSingle();
  if (error || !data) return { ok: false, message: "Couldn't delete. Please try again." };
  const paths = (images ?? []).map((i) => i.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length) await supabase.storage.from(PRODUCT_BUCKET).remove(paths);
  refreshSite(data.slug);
  return { ok: true, data: undefined };
}
