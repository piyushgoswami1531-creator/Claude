type Item = { q: string; a: string };

export default function Faq({ items }: { items: readonly Item[] }) {
  return (
    <div className="divide-y divide-surface-strong overflow-hidden rounded-3xl border border-surface-strong bg-surface">
      {items.map((item, i) => (
        <details key={item.q} className="group" open={i === 0}>
          <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-base font-medium text-ink-deep transition-colors hover:bg-surface-strong/40 md:px-7 md:text-lg [&::-webkit-details-marker]:hidden">
            {item.q}
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-surface-strong text-lg leading-none text-ink/70 transition-transform duration-300 group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <p className="px-5 pb-6 text-[15px] leading-relaxed text-ink/80 md:px-7 md:text-base">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
