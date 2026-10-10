"use client";

import imageCompression from "browser-image-compression";
import { getBrowserClient } from "@/lib/supabase/browser";
import { PRODUCT_BUCKET, publicPhotoUrl } from "@/lib/storage";

const MAX_WIDTH = 1600;

async function dimensions(blob: Blob) {
  const bmp = await createImageBitmap(blob);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
}

/** Phone photo → WebP, at most 1600px wide, aiming for under 500 KB. */
export async function compressPhoto(file: File, onProgress?: (percent: number) => void) {
  const { width, height } = await dimensions(file);
  // The library limits the longer side, so convert our width limit into that.
  const scale = Math.min(1, MAX_WIDTH / width);
  const longest = Math.round(Math.max(width, height) * scale);

  const blob = await imageCompression(file, {
    maxWidthOrHeight: longest,
    maxSizeMB: 0.5,
    initialQuality: 0.8,
    fileType: "image/webp",
    useWebWorker: true,
    onProgress,
  });
  return { blob, ...(await dimensions(blob)) };
}

export async function uploadPhoto(blob: Blob) {
  const path = `products/${crypto.randomUUID()}.webp`;
  const { error } = await getBrowserClient()
    .storage.from(PRODUCT_BUCKET)
    .upload(path, blob, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return { storage_path: path, url: publicPhotoUrl(path) };
}

/** Best effort: remove photos uploaded for a product that was never saved. */
export async function removePhotos(paths: string[]) {
  if (paths.length) await getBrowserClient().storage.from(PRODUCT_BUCKET).remove(paths).catch(() => undefined);
}
