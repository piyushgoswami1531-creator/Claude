import Link from "next/link";

export type PopularRow = { product_id: string; name: string; slug: string; clicks: number };

/** Products customers tapped "Order on WhatsApp" for most. */
export default function PopularList({ rows, days }: { rows: PopularRow[]; days: number }) {
  const max = Math.max(1, ...rows.map((r) => r.clicks));
  return (
    <section className="mt-8 rounded-3xl border border-surface-strong bg-surface p-5" aria-labelledby="popular">
      <h2 id="popular" className="font-sans text-xl font-semibold">Most popular</h2>
      <p className="mt-0.5 text-base text-ink/60">WhatsApp order taps in the last {days} days</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-base text-ink/70">No orders yet. When customers tap “Order on WhatsApp”, the most wanted products show up here.</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {rows.map((r, i) => (
            <li key={r.product_id}>
              <Link href={`/admin/edit/${r.product_id}`} className="relative flex min-h-[52px] items-center gap-3 overflow-hidden rounded-2xl px-3">
                <span aria-hidden className="absolute inset-y-0 left-0 rounded-2xl bg-surface-strong" style={{ width: `${(r.clicks / max) * 100}%` }} />
                <span className="relative w-6 shrink-0 text-base font-semibold text-ink/60">{i + 1}</span>
                <span className="relative flex-1 truncate text-base text-ink-deep">{r.name}</span>
                <span className="relative shrink-0 text-base font-semibold text-ink-deep">
                  {r.clicks} {r.clicks === 1 ? "tap" : "taps"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
