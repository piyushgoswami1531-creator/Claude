import type { Kind } from "./api";

export const subjectColor = (slot: string | null | undefined) => (slot ? `var(--${slot})` : "var(--ink-3)");

export function minutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export const parseDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const prettyDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  parseDate(iso).toLocaleDateString(undefined, opts);

export const KIND_LABEL: Record<Kind, string> = {
  learn: "Learn",
  revise: "Revise",
  buffer: "Buffer",
  final_revision: "Final revision",
};

export function kindLabel(kind: Kind, interval: number | null): string {
  return kind === "revise" && interval ? `Revise · day ${interval}` : KIND_LABEL[kind];
}
