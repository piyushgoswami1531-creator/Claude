"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteProduct } from "@/app/admin/_actions/products";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import ProductForm from "@/components/admin/ProductForm";
import ProductTile from "@/components/admin/ProductTile";
import { useToast } from "@/components/admin/Toast";
import type { AdminCategory, AdminProduct } from "@/lib/adminTypes";

type Props = { products: AdminProduct[]; categories: AdminCategory[]; aiEnabled: boolean; children?: React.ReactNode };

export default function AdminHome({ products, categories, aiEnabled, children }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [files, setFiles] = useState<File[] | null>(null);
  const [published, setPublished] = useState<{ name: string; slug: string } | null>(null);
  const [toDelete, setToDelete] = useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");

  const sheetOpen = files !== null || published !== null;
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
  }, [sheetOpen]);

  const pick = (list: FileList | null) => {
    if (list && list.length) {
      setPublished(null);
      setFiles(Array.from(list));
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const res = await deleteProduct(toDelete.id);
    setDeleting(false);
    if (res.ok) {
      toast(`“${toDelete.name}” deleted`);
      setToDelete(null);
      router.refresh();
    } else {
      toast(res.message, "error");
    }
  };

  const q = query.trim().toLowerCase();
  const shown = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;

  const addButton = (label: string, big = true) => (
    <label
      className={`flex cursor-pointer items-center justify-center gap-3 rounded-3xl bg-primary font-semibold text-canvas shadow-lift transition active:scale-[0.98] ${
        big ? "min-h-[96px] w-full text-2xl" : "h-16 w-full text-xl"
      }`}
    >
      <span className="text-4xl leading-none" aria-hidden>+</span> {label}
      {/* Opens the phone's camera / gallery */}
      <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
    </label>
  );

  return (
    <>
      {addButton("Add Product")}
      <p className="mt-3 text-center text-base text-ink/60">Take photos or choose from your gallery</p>

      {children}

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="font-sans text-xl font-semibold">Your products ({products.length})</h2>
        </div>
        {products.length > 8 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a product…"
            aria-label="Find a product"
            className="mb-4 h-14 w-full rounded-2xl border border-surface-strong bg-surface px-5 text-lg text-ink-deep placeholder:text-ink/40"
          />
        )}
        {products.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-surface-strong p-8 text-center text-base text-ink/70">No products yet. Tap “Add Product” to add your first one.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {shown.map((p) => (
              <ProductTile key={`${p.id}-${p.in_stock}-${p.is_featured}`} product={p} onDelete={() => setToDelete(p)} />
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this product?"
        text={`“${toDelete?.name ?? ""}” and its photos will be removed from your website. This can't be undone.`}
        confirmLabel="Yes, delete"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />

      {/* Add Product sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-canvas" role="dialog" aria-modal="true" aria-label="Add product">
          <div className="mx-auto max-w-2xl px-4 pt-4">
            {published ? (
              <div className="flex min-h-[80dvh] flex-col items-center justify-center text-center">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-primary text-4xl text-canvas" aria-hidden>✓</div>
                <h2 className="mt-6 text-3xl">Published!</h2>
                <p className="mt-2 text-lg text-ink/80">“{published.name}” is now live on your website.</p>
                <div className="mt-8 w-full max-w-sm space-y-3">
                  {addButton("Add another product", false)}
                  <Link href={`/product/${published.slug}`} target="_blank" className="grid h-14 place-items-center rounded-full border border-surface-strong text-lg font-medium text-ink-deep">
                    See it on the website
                  </Link>
                  <button type="button" onClick={() => setPublished(null)} className="h-14 w-full text-lg text-ink/70 underline underline-offset-4">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="pt-2 text-3xl">New product</h2>
                <ProductForm
                  key={files?.map((f) => f.name + f.size).join("|")}
                  categories={categories}
                  aiEnabled={aiEnabled}
                  initialFiles={files ?? []}
                  onCancel={() => setFiles(null)}
                  onSaved={(r) => {
                    setFiles(null);
                    setPublished({ name: r.name, slug: r.slug });
                    router.refresh();
                  }}
                />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
