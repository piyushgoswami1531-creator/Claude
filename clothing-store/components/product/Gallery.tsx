"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { ProductImage } from "@/lib/types";

/** Swipe on phones (native scroll-snap), thumbnails + arrows on desktop. */
export default function Gallery({ images, name }: { images: ProductImage[]; name: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = (i + images.length) % images.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  const onScroll = () => {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (images.length === 0) {
    return <div className="aspect-[4/5] rounded-3xl bg-surface" />;
  }

  return (
    <div className="md:flex md:flex-row-reverse md:gap-4">
      <div className="relative min-w-0 flex-1">
        <div
          ref={track}
          onScroll={onScroll}
          className="-mx-5 flex snap-x snap-mandatory overflow-x-auto md:mx-0 md:rounded-3xl"
          style={{ scrollbarWidth: "none" }}
          aria-roledescription="carousel"
          aria-label={`${name} photos`}
        >
          {images.map((img, i) => (
            <div
              key={img.url}
              className="relative aspect-[4/5] w-full shrink-0 snap-center bg-surface"
              aria-roledescription="slide"
              aria-label={`Photo ${i + 1} of ${images.length}`}
            >
              <Image
                src={img.url}
                alt={img.alt ?? `${name} — photo ${i + 1}`}
                fill
                priority={i === 0}
                sizes="(min-width: 1024px) 45vw, (min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        {images.length > 1 && (
          <>
            {/* Dots (phone) */}
            <div className="mt-3 flex justify-center gap-1.5 md:hidden" aria-hidden>
              {images.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-6 bg-primary" : "w-1.5 bg-surface-strong"}`} />
              ))}
            </div>
            {/* Arrows (desktop) */}
            <div className="pointer-events-none absolute inset-x-4 top-1/2 hidden -translate-y-1/2 justify-between md:flex">
              {[
                { label: "Previous photo", to: index - 1, d: "m15 18-6-6 6-6" },
                { label: "Next photo", to: index + 1, d: "m9 18 6-6-6-6" },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => goTo(b.to)}
                  aria-label={b.label}
                  className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-canvas/80 text-ink-deep shadow-soft backdrop-blur transition hover:bg-canvas"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={b.d} />
                  </svg>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-3 hidden gap-3 md:mt-0 md:flex md:w-20 md:flex-col">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              className={`relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-surface ring-2 transition ${
                i === index ? "ring-primary" : "ring-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
