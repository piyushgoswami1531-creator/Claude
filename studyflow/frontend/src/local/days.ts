// Calendar dates as whole day numbers (days since 1970-01-01, UTC), so date math
// never trips over time zones or daylight saving. ISO strings at the edges.

export type Day = number;

export const dayOf = (iso: string): Day => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

export const isoOf = (day: Day): string => new Date(day * 86_400_000).toISOString().slice(0, 10);

/** Today in the viewer's local time zone. */
export const todayDay = (): Day => {
  const n = new Date();
  return Math.round(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86_400_000);
};

/** Local timestamp "YYYY-MM-DDTHH:MM:SS" (like the server's naive datetimes). */
export const nowStamp = (): string => {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}T${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`;
};

export const stampDay = (stamp: string): Day => dayOf(stamp.slice(0, 10));
