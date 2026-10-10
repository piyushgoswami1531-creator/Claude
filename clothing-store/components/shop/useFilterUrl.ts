"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

/** Reads and writes shop filters in the URL (?size=M,L&colour=Black…). */
export function useFilterUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  const getList = useCallback(
    (key: string) => (searchParams.get(key) ?? "").split(",").filter(Boolean),
    [searchParams],
  );

  const toggleInList = useCallback(
    (key: string, value: string) => {
      const current = getList(key);
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      update({ [key]: next.join(",") || null });
    },
    [getList, update],
  );

  const clearAll = useCallback(() => {
    const q = searchParams.get("q");
    const sort = searchParams.get("sort");
    update({ size: null, colour: null, min: null, max: null, featured: null, category: null, q, sort });
  }, [searchParams, update]);

  return { searchParams, update, getList, toggleInList, clearAll, isPending };
}
