import { RulerIcon } from "@/components/ui/icons";
import type { SizeChart as Chart } from "@/lib/types";

export default function SizeChart({ chart, highlight }: { chart: Chart; highlight?: string | null }) {
  return (
    <details className="group rounded-2xl border border-surface-strong bg-surface">
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-5 font-medium text-ink-deep [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2.5">
          <RulerIcon className="h-5 w-5 text-accent-strong" /> Size chart
        </span>
        <span className="text-xl leading-none text-ink/60 transition-transform duration-300 group-open:rotate-45" aria-hidden>+</span>
      </summary>
      <div className="overflow-x-auto px-5 pb-5">
        <table className="w-full text-left text-[15px]">
          <thead>
            <tr className="border-b border-surface-strong text-ink/60">
              {chart.columns.map((c) => (
                <th key={c} scope="col" className="py-2.5 pr-4 font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row) => (
              <tr key={row[0]} className={`border-b border-surface-strong/60 last:border-0 ${row[0] === highlight ? "text-ink-deep" : "text-ink/80"}`}>
                {row.map((cell, i) => (
                  <td key={i} className={`py-2.5 pr-4 ${i === 0 ? "font-semibold" : ""} ${row[0] === highlight && i === 0 ? "text-ink-deep" : ""}`}>
                    {row[0] === highlight && i === 0 ? <span className="rounded-full bg-primary px-2 py-0.5 text-canvas">{cell}</span> : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-ink/60">All measurements in {chart.unit}. Between sizes? Message us and we&apos;ll help you choose.</p>
      </div>
    </details>
  );
}
