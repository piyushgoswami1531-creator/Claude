"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminPhoto } from "@/lib/adminTypes";
import { compressPhoto, removePhotos, uploadPhoto } from "@/lib/photoUpload";

export type PhotoItem = {
  key: string;
  preview: string;
  status: "waiting" | "compressing" | "uploading" | "done" | "error";
  progress: number;
  photo?: AdminPhoto;
};

let seq = 0;
const newKey = () => `p${++seq}`;

/** Photos in the form: compresses and uploads new ones one by one (gentle on phones). */
export function usePhotos(initial: AdminPhoto[] = []) {
  const [items, setItems] = useState<PhotoItem[]>(() =>
    initial.map((photo) => ({ key: newKey(), preview: photo.url, status: "done", progress: 100, photo })),
  );
  const uploadedHere = useRef<string[]>([]); // for clean-up if the form is abandoned
  const queue = useRef<string[]>([]);
  const pending = useRef(new Map<string, File>()); // kept outside state so the worker never misses one
  const running = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const patch = (key: string, p: Partial<PhotoItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const key = queue.current.shift()!;
      const file = pending.current.get(key);
      if (!file) continue;
      try {
        patch(key, { status: "compressing", progress: 0 });
        const { blob, width, height } = await compressPhoto(file, (p) => patch(key, { progress: Math.round(p * 0.7) }));
        patch(key, { status: "uploading", progress: 75 });
        const { storage_path, url } = await uploadPhoto(blob);
        uploadedHere.current.push(storage_path);
        pending.current.delete(key);
        // Removed while uploading? Delete the file again.
        if (!itemsRef.current.some((i) => i.key === key)) {
          await removePhotos([storage_path]);
          continue;
        }
        patch(key, { status: "done", progress: 100, photo: { storage_path, url, width, height } });
      } catch (e) {
        console.error("Photo upload failed", e);
        patch(key, { status: "error", progress: 0 });
      }
    }
    running.current = false;
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const fresh: PhotoItem[] = Array.from(files)
        .filter((f) => f.type.startsWith("image/") || f.type === "")
        .slice(0, 10)
        .map((file) => {
          const key = newKey();
          pending.current.set(key, file);
          return { key, preview: URL.createObjectURL(file), status: "waiting", progress: 0 };
        });
      if (!fresh.length) return;
      setItems((list) => [...list, ...fresh].slice(0, 10));
      queue.current.push(...fresh.map((f) => f.key));
      run();
    },
    [run],
  );

  const retry = (key: string) => {
    patch(key, { status: "waiting" });
    queue.current.push(key);
    run();
  };

  const remove = (key: string) => {
    pending.current.delete(key);
    setItems((list) => list.filter((i) => i.key !== key));
  };
  const makeCover = (key: string) =>
    setItems((list) => {
      const item = list.find((i) => i.key === key);
      return item ? [item, ...list.filter((i) => i.key !== key)] : list;
    });

  // Free preview memory.
  useEffect(() => () => itemsRef.current.forEach((i) => i.preview.startsWith("blob:") && URL.revokeObjectURL(i.preview)), []);

  const photos = items.filter((i) => i.status === "done" && i.photo).map((i) => i.photo!);
  const busy = items.some((i) => i.status === "waiting" || i.status === "compressing" || i.status === "uploading");
  const failed = items.some((i) => i.status === "error");

  /** Photos uploaded in this form that didn't end up saved. */
  const unsavedUploads = (saved: AdminPhoto[]) => {
    const keep = new Set(saved.map((p) => p.storage_path));
    return uploadedHere.current.filter((p) => !keep.has(p));
  };

  return { items, photos, busy, failed, addFiles, retry, remove, makeCover, unsavedUploads };
}
