"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { setProductFlag } from "@/app/admin/_actions/products";
import { useToast } from "@/components/admin/Toast";
import Toggle from "@/components/admin/Toggle";
import type { AdminProduct } from "@/lib/adminTypes";
import { formatPrice } from "@/lib/format";

export default function ProductTile({ product, onDelete }: { product: AdminProduct; onDelete: () => void }) {
  const toast = useToast();
  const [flags, setFlags] = useState({ in_stock: product.in_stock, is_featured: product.is_featured });
  const [busy, setBusy] = useState(false);
  const cover = product.images[0];

  const change = async (field: keyof typeof flags, value: boolean) => {
    setFlags((f) => ({ ...f, [field]: value })); // show it straight away
    setBusy(true);
    const res = await setProductFlag(product.id, field, value);
    setBusy(false);
    if (!res.ok) {
      setFlags((f) => ({ ...f, [field]: !value }));
      toast(res.message, "error");
    } else {
      toast(field === "in_stock" ? (value ? "Marked in stock" : "Marked sold out") : value ? "Now featured on home page" : "Removed from featured");
    }
  };

  return (
    <li className="overflow-hidden rounded-3xl border border-surface-strong bg-surface">
      <div className="relative aspect-[4/5] bg-canvas">
        {cover && <Image src={cover.url} alt="" fill sizes="(min-width: 768px) 33vw, 50vw" className={`object-cover ${flags.in_stock ? "" : "opacity-40 grayscale"}`} />}
        {!flags.in_stock && <span className="absolute left-3 top-3 rounded-full bg-canvas px-3 py-1.5 text-base font-semibold text-ink-deep">Sold out</span>}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-[3rem] text-base font-medium leading-6 text-ink-deep">{product.name}</p>
        <p className="mt-1 text-lg font-semibold text-ink-deep">
          {formatPrice(product.sale_price ?? product.price)}
          {product.sale_price !== null && <span className="ml-2 text-base font-normal text-ink/50 line-through">{formatPrice(product.price)}</span>}
        </p>
      </div>
      <div className="border-t border-surface-strong px-1 py-1">
        <Toggle label="In stock" checked={flags.in_stock} disabled={busy} onChange={(v) => change("in_stock", v)} />
        <Toggle label="Featured" checked={flags.is_featured} disabled={busy} onChange={(v) => change("is_featured", v)} />
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-surface-strong p-2">
        <Link href={`/admin/edit/${product.id}`} className="grid h-12 place-items-center rounded-full bg-surface-strong text-base font-medium text-ink-deep">
          Edit
        </Link>
        <button type="button" onClick={onDelete} className="h-12 rounded-full border border-surface-strong text-base font-medium text-ink-deep">
          Delete
        </button>
      </div>
    </li>
  );
}
