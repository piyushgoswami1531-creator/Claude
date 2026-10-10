"use client";

import { useRef, useState } from "react";
import Chip from "@/components/ui/Chip";
import { WhatsAppIcon } from "@/components/ui/icons";
import SizeChart from "@/components/product/SizeChart";
import Swatch from "@/components/product/Swatch";
import { formatPrice } from "@/lib/format";
import type { SizeChart as Chart } from "@/lib/types";
import { orderMessage, whatsappLink } from "@/lib/whatsapp";

type Props = {
  name: string;
  slug: string;
  price: number; // what the customer pays
  sizes: string[];
  colours: string[];
  inStock: boolean;
  sizeChart: Chart | null;
};

export default function ProductPurchase({ name, slug, price, sizes, colours, inStock, sizeChart }: Props) {
  // Pre-select when there's only one option, so the customer has nothing to do.
  const [size, setSize] = useState<string | null>(sizes.length === 1 ? sizes[0] : null);
  const [colour, setColour] = useState<string | null>(colours.length === 1 ? colours[0] : null);
  const [missing, setMissing] = useState<"size" | "colour" | null>(null);
  const sizeRef = useRef<HTMLFieldSetElement>(null);
  const colourRef = useRef<HTMLFieldSetElement>(null);

  const link = whatsappLink(orderMessage({ name, slug, size, colour, price: formatPrice(price), inStock }));

  // Ask for a size/colour before opening WhatsApp, so the owner gets a complete order.
  const onOrder = (e: React.MouseEvent) => {
    if (!inStock) return;
    const need = sizes.length > 1 && !size ? "size" : colours.length > 1 && !colour ? "colour" : null;
    if (need) {
      e.preventDefault();
      setMissing(need);
      (need === "size" ? sizeRef : colourRef).current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const label = inStock ? "Order on WhatsApp" : "Ask about restock";

  return (
    <div className="space-y-7">
      {sizes.length > 0 && (
        <fieldset ref={sizeRef}>
          <legend className="mb-3 flex w-full items-baseline justify-between">
            <span className="eyebrow">Size{size ? `: ${size}` : ""}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => (
              <Chip key={s} selected={size === s} onClick={() => { setSize(s); setMissing(null); }} className="min-w-[56px]">
                {s}
              </Chip>
            ))}
          </div>
          {missing === "size" && <p role="alert" className="mt-3 text-[15px] font-medium text-ink-deep">↑ Please choose your size first</p>}
        </fieldset>
      )}

      {colours.length > 0 && (
        <fieldset ref={colourRef}>
          <legend className="eyebrow mb-3">Colour{colour ? `: ${colour}` : ""}</legend>
          <div className="flex flex-wrap gap-2">
            {colours.map((c) => (
              <Chip key={c} selected={colour === c} onClick={() => { setColour(c); setMissing(null); }}>
                <Swatch name={c} size={20} /> {c}
              </Chip>
            ))}
          </div>
          {missing === "colour" && <p role="alert" className="mt-3 text-[15px] font-medium text-ink-deep">↑ Please choose a colour first</p>}
        </fieldset>
      )}

      {sizeChart && <SizeChart chart={sizeChart} highlight={size} />}

      <div>
        <a
          href={link}
          onClick={onOrder}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[60px] w-full items-center justify-center gap-3 rounded-full bg-primary px-6 text-lg font-semibold text-canvas shadow-lift transition-all duration-300 hover:bg-primary-hover active:scale-[0.98]"
        >
          <WhatsAppIcon className="h-6 w-6" /> {label}
        </a>
        <p className="mt-3 text-center text-sm text-ink/60">
          {inStock ? "Opens WhatsApp with your size and colour filled in. No payment online." : "This item is sold out right now — message us and we'll tell you when it's back."}
        </p>
      </div>

      {/* Sticky order bar on phones */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-strong bg-canvas/95 px-5 py-3 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-4">
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight text-ink-deep">{formatPrice(price)}</p>
            <p className="truncate text-xs text-ink/60">{[size, colour].filter(Boolean).join(" · ") || "Choose size & colour"}</p>
          </div>
          <a
            href={link}
            onClick={onOrder}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-base font-semibold text-canvas active:scale-[0.98]"
          >
            <WhatsAppIcon className="h-5 w-5" /> {inStock ? "Order" : "Ask"}
          </a>
        </div>
      </div>
    </div>
  );
}
