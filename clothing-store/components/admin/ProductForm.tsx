"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { suggestProductDetails, type Suggestion } from "@/app/admin/_actions/ai";
import { saveProduct } from "@/app/admin/_actions/products";
import { useToast } from "@/components/admin/Toast";
import Toggle from "@/components/admin/Toggle";
import { usePhotos, type PhotoItem } from "@/components/admin/usePhotos";
import Swatch from "@/components/product/Swatch";
import type { AdminCategory, AdminProduct } from "@/lib/adminTypes";
import { COMMON_COLOURS } from "@/lib/colours";
import { removePhotos } from "@/lib/photoUpload";
import { siteConfig } from "@/lib/siteConfig";

const SIZES = [...siteConfig.sizes, "Free Size"];

type Props = {
  categories: AdminCategory[];
  product?: AdminProduct; // editing when set
  initialFiles?: File[];
  aiEnabled?: boolean;
  onSaved: (result: { id: string; slug: string; name: string }) => void;
  onCancel: () => void;
};

const parseMoney = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^\d.]/g, "")));

export default function ProductForm({ categories, product, initialFiles, aiEnabled = false, onSaved, onCancel }: Props) {
  const toast = useToast();
  const photos = usePhotos(product?.images);
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.category_id ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [salePrice, setSalePrice] = useState(product?.sale_price ? String(product.sale_price) : "");
  const [showSale, setShowSale] = useState(Boolean(product?.sale_price));
  const [sizes, setSizes] = useState<string[]>(product?.sizes ?? []);
  const [colours, setColours] = useState<string[]>(product?.colours ?? []);
  const [customColour, setCustomColour] = useState("");
  const [inStock, setInStock] = useState(product?.in_stock ?? true);
  const [featured, setFeatured] = useState(product?.is_featured ?? false);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();
  const [ai, setAi] = useState<{ state: "idle" | "working" | "done" | "failed"; message?: string }>({ state: "idle" });
  const started = useRef(false);

  // Photos chosen on the admin home start compressing straight away.
  useEffect(() => {
    if (!started.current && initialFiles?.length) photos.addFiles(initialFiles);
    started.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear the old message as soon as the owner changes anything.
  useEffect(() => setError(""), [name, categoryId, price, salePrice, sizes, colours, photos.items.length]);

  const groups = useMemo(() => {
    const top = categories.filter((c) => !c.parent_id);
    return top.map((parent) => {
      const kids = categories.filter((c) => c.parent_id === parent.id);
      return { parent, options: kids.length ? kids : [parent] };
    });
  }, [categories]);

  const cover = photos.photos[0]?.storage_path ?? null;

  /** Ask AI for name, description, category and colour. `overwrite` replaces what's already typed. */
  const runAi = async (overwrite: boolean) => {
    if (!cover) return;
    setAi({ state: "working" });
    const leaves = groups.flatMap(({ parent, options }) =>
      options.map((c) => ({ id: c.id, label: c.id === parent.id ? c.name : `${parent.name} › ${c.name}` })),
    );
    const res = await suggestProductDetails(cover, leaves);
    if (!res.ok) {
      setAi({ state: "failed", message: res.message });
      return;
    }
    const s: Suggestion = res.data;
    const pick = <T,>(current: T, empty: boolean, next: T) => (overwrite || empty ? next : current);
    if (s.name) setName((v) => pick(v, !v.trim(), s.name));
    if (s.description) setDescription((v) => pick(v, !v.trim(), s.description));
    if (s.category_id) setCategoryId((v) => pick(v, !v, s.category_id!));
    if (s.colours.length) setColours((v) => pick(v, v.length === 0, s.colours));
    setAi({ state: "done" });
  };

  // New product: suggest details as soon as the first photo is uploaded.
  useEffect(() => {
    if (aiEnabled && !product && cover && ai.state === "idle") runAi(false);
  }, [cover]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleIn = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const colourChoices = [...new Set([...COMMON_COLOURS, ...colours])];

  const addCustomColour = () => {
    const c = customColour.trim().replace(/\s+/g, " ");
    if (!c) return;
    const nice = c.charAt(0).toUpperCase() + c.slice(1);
    setColours((list) => (list.includes(nice) ? list : [...list, nice]));
    setCustomColour("");
  };

  const cancel = () => {
    removePhotos(photos.unsavedUploads(product?.images ?? []));
    onCancel();
  };

  const publish = () => {
    setError("");
    const p = parseMoney(price);
    const s = showSale ? parseMoney(salePrice) : null;
    // Friendly checks first; the server checks again.
    const problem =
      photos.items.length === 0 ? "Please add at least one photo." :
      photos.failed ? "A photo didn't upload. Tap Retry on it or remove it." :
      !name.trim() ? "Please give the product a name." :
      !categoryId ? "Please choose a category." :
      !p || p <= 0 ? "Please enter the price." :
      s !== null && (!s || s >= p) ? "The offer price must be lower than the normal price." :
      sizes.length === 0 ? "Please tap at least one size." : "";
    if (problem) {
      setError(problem);
      return;
    }

    startSaving(async () => {
      const images = photos.photos;
      const res = await saveProduct(
        { name, description, category_id: categoryId, price: p!, sale_price: s, sizes, colours, in_stock: inStock, is_featured: featured, images },
        product?.id,
      );
      if (!res.ok) {
        setError(res.message);
        toast(res.message, "error");
        return;
      }
      removePhotos(photos.unsavedUploads(images));
      onSaved({ ...res.data, name: name.trim() });
    });
  };

  const field = "w-full rounded-2xl border border-surface-strong bg-surface px-4 text-lg text-ink-deep placeholder:text-ink/40 focus:border-accent";
  const chip = (on: boolean) =>
    `inline-flex min-h-[52px] min-w-[52px] items-center justify-center gap-2 rounded-full border px-5 text-base font-medium transition active:scale-95 ${
      on ? "border-primary bg-primary text-canvas" : "border-surface-strong bg-surface text-ink-deep"
    }`;

  return (
    <div className="pb-36">
      {/* Photos */}
      <Section title="Photos" hint="The first photo is the cover. Tap a photo to make it the cover.">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {photos.items.map((item, i) => (
            <PhotoTile key={item.key} item={item} isCover={i === 0} onCover={() => photos.makeCover(item.key)} onRemove={() => photos.remove(item.key)} onRetry={() => photos.retry(item.key)} />
          ))}
          {photos.items.length < 10 && (
            <label className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-surface-strong text-base text-ink/70 active:bg-surface">
              <span className="text-3xl leading-none">+</span>
              <span>Add photo</span>
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { if (e.target.files) photos.addFiles(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </Section>

      <Section title="Price">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-ink/60">{siteConfig.currency.symbol}</span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
            aria-label="Price"
            className={`${field} h-16 pl-10 text-2xl font-semibold`}
          />
        </div>
        {showSale ? (
          <div className="mt-3">
            <label className="mb-2 block text-base text-ink/80">Offer price (customers pay this)</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-ink/60">{siteConfig.currency.symbol}</span>
              <input inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="0" aria-label="Offer price" className={`${field} h-14 pl-10 text-xl`} />
            </div>
            <button type="button" onClick={() => { setShowSale(false); setSalePrice(""); }} className="mt-2 min-h-[48px] text-base text-ink/70 underline underline-offset-4">
              Remove offer
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowSale(true)} className="mt-3 min-h-[48px] text-base font-medium text-ink-deep underline underline-offset-4">
            + Add an offer price
          </button>
        )}
      </Section>

      <Section title="Sizes" hint="Tap every size you have.">
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button key={s} type="button" aria-pressed={sizes.includes(s)} onClick={() => setSizes((l) => toggleIn(l, s))} className={chip(sizes.includes(s))}>
              {s}
            </button>
          ))}
        </div>
      </Section>

      {aiEnabled && (
        <div className="mt-6 rounded-2xl border border-surface-strong bg-surface p-4" aria-live="polite">
          {ai.state === "working" ? (
            <p className="flex items-center gap-3 text-base text-ink-deep">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink/30 border-t-ink-deep" aria-hidden />
              Looking at your photo and filling in the details…
            </p>
          ) : ai.state === "done" ? (
            <p className="text-base text-ink-deep">✨ Name, category, colour and description were filled in from your photo. Please check them and change anything that&apos;s wrong.</p>
          ) : ai.state === "failed" ? (
            <p className="text-base text-ink-deep">⚠ {ai.message}</p>
          ) : (
            <p className="text-base text-ink/70">{cover ? "Tap below to fill in the details from your photo." : "Details will be filled in automatically once a photo is uploaded."}</p>
          )}
          {cover && ai.state !== "working" && (
            <button type="button" onClick={() => runAi(true)} className="mt-3 h-12 w-full rounded-full border border-surface-strong text-base font-medium text-ink-deep">
              ✨ {ai.state === "idle" ? "Fill in from photo" : "Suggest again"}
            </button>
          )}
        </div>
      )}

      <Section title="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cotton Checked Shirt" aria-label="Product name" className={`${field} h-14`} />
      </Section>

      <Section title="Category">
        <div className="space-y-4">
          {groups.map(({ parent, options }) => (
            <div key={parent.id}>
              {options[0].id !== parent.id && <p className="mb-2 text-base text-ink/60">{parent.name}</p>}
              <div className="flex flex-wrap gap-2">
                {options.map((c) => (
                  <button key={c.id} type="button" aria-pressed={categoryId === c.id} onClick={() => setCategoryId(c.id)} className={chip(categoryId === c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Colour" hint="Tap one or more.">
        <div className="flex flex-wrap gap-2">
          {colourChoices.map((c) => (
            <button key={c} type="button" aria-pressed={colours.includes(c)} onClick={() => setColours((l) => toggleIn(l, c))} className={chip(colours.includes(c))}>
              <Swatch name={c} size={20} /> {c}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={customColour}
            onChange={(e) => setCustomColour(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomColour(); } }}
            placeholder="Other colour…"
            aria-label="Other colour"
            className={`${field} h-14 flex-1`}
          />
          <button type="button" onClick={addCustomColour} className="h-14 rounded-full border border-surface-strong px-5 text-base font-medium text-ink-deep">
            Add
          </button>
        </div>
      </Section>

      <Section title="Description" hint="Optional. Fabric, fit, how to wear it.">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} aria-label="Description" className={`${field} py-3 text-base leading-relaxed`} />
      </Section>

      <Section title="Show on website">
        <div className="rounded-2xl border border-surface-strong bg-surface p-1">
          <Toggle label="In stock" checked={inStock} onChange={setInStock} />
          <Toggle label="Featured on home page" checked={featured} onChange={setFeatured} />
        </div>
      </Section>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-[70] border-t border-surface-strong bg-canvas/95 backdrop-blur-md" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto max-w-2xl px-4 pt-3">
          {error && (
            <p role="alert" className="mb-3 rounded-2xl border border-surface-strong bg-surface px-4 py-3 text-base text-ink-deep">
              ⚠ {error}
            </p>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={cancel} disabled={saving} className="h-16 rounded-full border border-surface-strong px-6 text-base font-medium text-ink-deep">
              Cancel
            </button>
            <button
              type="button"
              onClick={publish}
              disabled={saving || photos.busy}
              className="h-16 flex-1 rounded-full bg-primary text-xl font-semibold text-canvas shadow-lift transition active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? "Saving…" : photos.busy ? "Uploading photos…" : product ? "Save changes" : "Publish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-surface-strong py-6 last:border-0">
      <h2 className="font-sans text-lg font-semibold text-ink-deep">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-base text-ink/60">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function PhotoTile({ item, isCover, onCover, onRemove, onRetry }: { item: PhotoItem; isCover: boolean; onCover: () => void; onRemove: () => void; onRetry: () => void }) {
  const working = item.status !== "done" && item.status !== "error";
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface">
      <button type="button" onClick={onCover} className="absolute inset-0" aria-label={isCover ? "Cover photo" : "Make this the cover photo"}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local previews (blob: URLs) can't use next/image */}
        <img src={item.preview} alt="" className={`h-full w-full object-cover transition ${working ? "opacity-50" : ""}`} />
      </button>
      {isCover && <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-primary px-2.5 py-1 text-base font-semibold leading-none text-canvas">Cover</span>}
      <button type="button" onClick={onRemove} aria-label="Remove photo" className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full bg-black/70 text-xl text-white">
        ×
      </button>
      {working && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2">
          <div className="h-2 overflow-hidden rounded-full bg-black/50">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.max(item.progress, 8)}%` }} />
          </div>
        </div>
      )}
      {item.status === "error" && (
        <button type="button" onClick={onRetry} className="absolute inset-x-2 bottom-2 h-11 rounded-full bg-primary text-base font-semibold text-canvas">
          Retry
        </button>
      )}
    </div>
  );
}
