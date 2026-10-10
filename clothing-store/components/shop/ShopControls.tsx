"use client";

import { useEffect, useRef, useState } from "react";
import Chip from "@/components/ui/Chip";
import { CloseIcon, SearchIcon, SlidersIcon } from "@/components/ui/icons";
import Swatch from "@/components/product/Swatch";
import { SORTS } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { siteConfig } from "@/lib/siteConfig";
import { useFilterUrl } from "@/components/shop/useFilterUrl";

type CategoryOption = { slug: string; name: string };

type Props = {
  facets: { sizes: string[]; colours: string[] };
  /** Category chips inside the filter panel (only on /shop). */
  categoryOptions?: CategoryOption[];
  resultCount: number;
  children: React.ReactNode; // the product grid, rendered on the server
};

const bandLabel = ({ min, max }: { min?: number; max?: number }) =>
  min === undefined ? `Under ${formatPrice((max ?? 0) + 1)}` : max === undefined ? `${formatPrice(min)}+` : `${formatPrice(min)} – ${formatPrice(max)}`;

export default function ShopControls({ facets, categoryOptions, resultCount, children }: Props) {
  const { searchParams, update, getList, toggleInList, clearAll, isPending } = useFilterUrl();
  const [sheetOpen, setSheetOpen] = useState(false);

  const sizes = getList("size");
  const colours = getList("colour");
  const min = searchParams.get("min");
  const max = searchParams.get("max");
  const category = searchParams.get("category");
  const featured = searchParams.get("featured") === "1";
  const sort = searchParams.get("sort") ?? "featured";
  const activeCount = sizes.length + colours.length + (min || max ? 1 : 0) + (featured ? 1 : 0) + (category ? 1 : 0);

  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sheetOpen]);

  const panel = (
    <div className="space-y-8">
      {categoryOptions && categoryOptions.length > 0 && (
        <FilterGroup title="Category">
          {categoryOptions.map((c) => (
            <Chip key={c.slug} selected={category === c.slug} onClick={() => update({ category: category === c.slug ? null : c.slug })}>
              {c.name}
            </Chip>
          ))}
        </FilterGroup>
      )}

      {facets.sizes.length > 0 && (
        <FilterGroup title="Size">
          {facets.sizes.map((s) => (
            <Chip key={s} selected={sizes.includes(s)} onClick={() => toggleInList("size", s)}>
              {s}
            </Chip>
          ))}
        </FilterGroup>
      )}

      {facets.colours.length > 0 && (
        <FilterGroup title="Colour">
          {facets.colours.map((c) => (
            <Chip key={c} selected={colours.includes(c)} onClick={() => toggleInList("colour", c)}>
              <Swatch name={c} /> {c}
            </Chip>
          ))}
        </FilterGroup>
      )}

      <FilterGroup title="Price">
        {siteConfig.priceBands.map((band) => {
          const bMin = band.min ? String(band.min) : null;
          const bMax = band.max ? String(band.max) : null;
          const selected = min === bMin && max === bMax;
          return (
            <Chip
              key={`${bMin}-${bMax}`}
              selected={selected}
              onClick={() => update(selected ? { min: null, max: null } : { min: bMin, max: bMax })}
            >
              {bandLabel(band)}
            </Chip>
          );
        })}
      </FilterGroup>

      <FilterGroup title="Show only">
        <Chip selected={featured} onClick={() => update({ featured: featured ? null : "1" })}>
          Featured picks
        </Chip>
      </FilterGroup>
    </div>
  );

  return (
    <>
      {/* Toolbar */}
      <div className="sticky top-16 z-30 -mx-5 mb-6 border-b border-surface-strong bg-canvas/90 px-5 py-3 backdrop-blur-md md:top-20 md:mx-0 md:rounded-2xl md:border md:px-4">
        <div className="flex items-center gap-2 md:gap-3">
          <SearchBox initial={searchParams.get("q") ?? ""} onSearch={(q) => update({ q: q || null })} />

          <label className="sr-only" htmlFor="sort">Sort by</label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => update({ sort: e.target.value === "featured" ? null : e.target.value })}
            className="hidden h-12 rounded-full border border-surface-strong bg-surface px-4 text-[15px] text-ink-deep sm:block"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="relative inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-surface-strong bg-surface px-4 text-[15px] font-medium text-ink-deep transition hover:border-accent lg:hidden"
          >
            <SlidersIcon className="h-5 w-5" />
            <span>Filters</span>
            {activeCount > 0 && (
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-canvas">{activeCount}</span>
            )}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm text-ink/60">
          <p aria-live="polite">{isPending ? "Updating…" : `${resultCount} ${resultCount === 1 ? "product" : "products"}`}</p>
          {activeCount > 0 && (
            <button type="button" onClick={clearAll} className="min-h-[32px] font-medium text-ink-deep underline underline-offset-4">
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-10">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-48">{panel}</div>
        </aside>

        <div className={`transition-opacity duration-300 ${isPending ? "opacity-50" : "opacity-100"}`}>{children}</div>
      </div>

      {/* Mobile filter sheet */}
      <div className={`fixed inset-0 z-[60] lg:hidden ${sheetOpen ? "visible" : "invisible"}`} aria-hidden={!sheetOpen}>
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${sheetOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setSheetOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
          className={`absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-3xl border-t border-surface-strong bg-canvas shadow-lift transition-transform duration-300 ease-out ${
            sheetOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 className="text-2xl">Filters</h2>
            <button type="button" onClick={() => setSheetOpen(false)} className="grid h-12 w-12 place-items-center rounded-full hover:bg-surface" aria-label="Close filters">
              <CloseIcon />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <FilterGroup title="Sort by">
              {SORTS.map((s) => (
                <Chip key={s.value} selected={sort === s.value} onClick={() => update({ sort: s.value === "featured" ? null : s.value })}>
                  {s.label}
                </Chip>
              ))}
            </FilterGroup>
            <div className="mt-8">{panel}</div>
          </div>
          <div className="flex gap-3 border-t border-surface-strong px-5 py-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <button type="button" onClick={clearAll} className="h-12 flex-1 rounded-full border border-surface-strong text-base font-medium text-ink-deep">
              Clear all
            </button>
            <button type="button" onClick={() => setSheetOpen(false)} className="h-12 flex-[2] rounded-full bg-primary text-base font-semibold text-canvas">
              {isPending ? "Updating…" : `Show ${resultCount} ${resultCount === 1 ? "product" : "products"}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="eyebrow mb-3">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function SearchBox({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const [value, setValue] = useState(initial);
  const first = useRef(true);

  // Keep in sync when the URL changes elsewhere (e.g. "Clear filters").
  useEffect(() => setValue(initial), [initial]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (value.trim() === initial) return;
    const t = setTimeout(() => onSearch(value.trim()), 350);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative min-w-0 flex-1">
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/50" />
      <input
        type="search"
        inputMode="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search shirts, jeans, kurtas…"
        aria-label="Search products"
        className="h-12 w-full rounded-full border border-surface-strong bg-surface pl-11 pr-4 text-base text-ink-deep placeholder:text-ink/40 focus:border-accent"
      />
    </div>
  );
}
