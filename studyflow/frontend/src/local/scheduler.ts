/**
 * Deterministic study scheduler — a direct TypeScript port of
 * backend/app/services/scheduler.py (same algorithm, same constants).
 * Pure functions: topics in, day-by-day items out.
 */
import type { Day } from "./days";

export type Strength = "weak" | "neutral" | "strong";
export type Kind = "learn" | "revise" | "buffer" | "final_revision";

export const STRENGTH_FACTOR: Record<string, number> = { weak: 1.4, neutral: 1.0, strong: 0.75 };
const STRENGTH_RANK: Record<string, number> = { weak: 0, neutral: 1, strong: 2 };
export const REVISION_INTERVALS = [1, 3, 7] as const;
export const MIN_CHUNK = 15;
const BUFFER_EVERY = 7;

const difficultyFactor = (d: number) => ({ 1: 0.8, 2: 0.9, 3: 1.0, 4: 1.2, 5: 1.4 } as Record<number, number>)[d] ?? 1.0;

export const weightedMinutes = (est: number, difficulty: number, strength: string) =>
  Math.max(MIN_CHUNK, Math.round(est * difficultyFactor(difficulty) * (STRENGTH_FACTOR[strength] ?? 1)));

export const revisionMinutes = (topicMinutes: number) => Math.min(25, Math.max(10, Math.round(topicMinutes * 0.2)));

export interface TopicIn {
  id: number;
  subjectId: number;
  strength: string;
  minutes: number;
  difficulty: number;
  order: number;
  fullMinutes?: number;
}

export interface SeedRevision { due: Day; topicId: number; minutes: number; interval: number }

export interface PlannedItem { date: Day; kind: Kind; minutes: number; topicId: number | null; revInterval: number | null }

export interface ScheduleResult {
  items: PlannedItem[];
  overloaded: boolean;
  requiredDailyMinutes: number | null;
}

export function splitDays(start: Day, exam: Day): { study: Day[]; buffers: Day[]; final: Day[] } {
  const n = exam - start;
  if (n <= 0) return { study: [], buffers: [], final: [] };
  const days = Array.from({ length: n }, (_, i) => start + i);
  const finalCount = n >= 3 ? Math.max(1, Math.round(n * 0.1)) : 0;
  const final = finalCount ? days.slice(n - finalCount) : [];
  const rest = days.slice(0, n - finalCount);
  const buffers: Day[] = [];
  const study: Day[] = [];
  rest.forEach((d, i) => {
    if (rest.length >= BUFFER_EVERY && (i + 1) % BUFFER_EVERY === 0) buffers.push(d);
    else study.push(d);
  });
  return { study, buffers, final };
}

/** Round-robin across subjects; weak subjects lead each round. */
export function interleave(topics: TopicIn[]): TopicIn[] {
  const bySubject = new Map<number, TopicIn[]>();
  const strengthOf = new Map<number, string>();
  const firstOrder = new Map<number, number>();
  for (const t of [...topics].sort((a, b) => a.order - b.order)) {
    if (!bySubject.has(t.subjectId)) bySubject.set(t.subjectId, []);
    bySubject.get(t.subjectId)!.push(t);
    strengthOf.set(t.subjectId, t.strength);
    if (!firstOrder.has(t.subjectId)) firstOrder.set(t.subjectId, t.order);
  }
  const order = [...bySubject.keys()].sort(
    (a, b) => (STRENGTH_RANK[strengthOf.get(a)!] ?? 1) - (STRENGTH_RANK[strengthOf.get(b)!] ?? 1) || firstOrder.get(a)! - firstOrder.get(b)!,
  );
  const out: TopicIn[] = [];
  while (order.some((s) => bySubject.get(s)!.length)) {
    for (const s of order) {
      const q = bySubject.get(s)!;
      if (q.length) out.push(q.shift()!);
    }
  }
  return out;
}

const KIND_ORDER: Record<Kind, number> = { revise: 0, learn: 1, final_revision: 2, buffer: 3 };

export function buildSchedule(
  topics: TopicIn[],
  start: Day,
  exam: Day,
  dailyMinutesIn: number,
  seedRevisions: SeedRevision[] = [],
  usedToday = 0,
): ScheduleResult {
  const dailyMinutes = Math.max(15, Math.floor(dailyMinutesIn));
  let { study, buffers, final } = splitDays(start, exam);
  const result: ScheduleResult = { items: [], overloaded: false, requiredDailyMinutes: null };
  if (!study.length && !buffers.length && !final.length) {
    result.overloaded = topics.length > 0;
    return result;
  }
  if (!study.length) {
    study = [...study, ...buffers, ...final].sort((a, b) => a - b);
    buffers = [];
    final = [];
  }

  const pending = topics.filter((t) => t.minutes > 0);
  const full = new Map(pending.map((t) => [t.id, t.fullMinutes ?? t.minutes]));
  const usedFirst = Math.min(usedToday, dailyMinutes);

  // capacity check & proportional squeeze
  const capacity = study.length * dailyMinutes - usedFirst;
  const learnDemand = pending.reduce((n, t) => n + t.minutes, 0);
  let revDemand = pending.reduce((n, t) => n + revisionMinutes(full.get(t.id)!) * REVISION_INTERVALS.length, 0);
  revDemand += seedRevisions.reduce((n, s) => n + s.minutes, 0);
  const demand = learnDemand + revDemand;
  let scale = 1;
  if (demand > capacity && demand > 0) {
    result.overloaded = true;
    result.requiredDailyMinutes = Math.ceil((demand + usedFirst) / study.length);
    scale = Math.max(capacity, 0) / demand;
  }
  const scaled = (m: number) => (scale < 1 ? Math.max(m >= MIN_CHUNK ? MIN_CHUNK : m, Math.round(m * scale)) : m);
  const revMins = (m: number) => (scale >= 1 ? m : Math.max(10, Math.round(m * scale)));

  const remaining = new Map(pending.map((t) => [t.id, scaled(t.minutes)]));
  const queue = interleave(pending);
  const studySet = [...study].sort((a, b) => a - b);
  const snap = (d: Day): Day | null => studySet.find((s) => s >= d) ?? null;

  const revisionsDue = new Map<Day, PlannedItem[]>();
  const queueRevision = (due: Day, topicId: number, minutes: number, interval: number) => {
    const day = snap(due);
    if (day === null) return;
    if (!revisionsDue.has(day)) revisionsDue.set(day, []);
    revisionsDue.get(day)!.push({ date: day, kind: "revise", minutes, topicId, revInterval: interval });
  };
  for (const s of seedRevisions) queueRevision(Math.max(s.due, start), s.topicId, revMins(s.minutes), s.interval);

  let carry: PlannedItem[] = [];
  for (const day of studySet) {
    let cap = dailyMinutes - (day === start ? usedFirst : 0);

    const todays = [...carry, ...(revisionsDue.get(day) ?? [])];
    revisionsDue.delete(day);
    carry = [];
    for (const rev of todays) {
      if (cap >= rev.minutes || cap >= 10) {
        rev.date = day;
        rev.minutes = Math.min(rev.minutes, Math.max(cap, 10));
        result.items.push(rev);
        cap -= rev.minutes;
      } else carry.push(rev);
    }

    while (queue.length && cap > 0) {
      const t = queue[0];
      const need = remaining.get(t.id)!;
      const chunk = Math.min(need, cap);
      if (chunk < need && chunk < MIN_CHUNK) break;
      result.items.push({ date: day, kind: "learn", minutes: chunk, topicId: t.id, revInterval: null });
      remaining.set(t.id, need - chunk);
      cap -= chunk;
      if (remaining.get(t.id)! <= 0) {
        queue.shift();
        for (const interval of REVISION_INTERVALS) queueRevision(day + interval, t.id, revMins(revisionMinutes(full.get(t.id)!)), interval);
      }
    }
  }

  if (queue.length && studySet.length) {
    result.overloaded = true;
    const last = studySet[studySet.length - 1];
    for (const t of queue) {
      const r = remaining.get(t.id)!;
      if (r > 0) result.items.push({ date: last, kind: "learn", minutes: r, topicId: t.id, revInterval: null });
    }
    if (result.requiredDailyMinutes === null) result.requiredDailyMinutes = Math.ceil(demand / studySet.length);
  }

  for (const d of buffers) result.items.push({ date: d, kind: "buffer", minutes: dailyMinutes, topicId: null, revInterval: null });

  if (final.length) {
    const all = [...topics].sort(
      (a, b) => (STRENGTH_RANK[a.strength] ?? 1) - (STRENGTH_RANK[b.strength] ?? 1) || b.difficulty - a.difficulty || a.order - b.order,
    );
    if (all.length) {
      const perDay = Math.min(3, all.length);
      const each = Math.max(10, Math.floor(dailyMinutes / perDay));
      let k = 0;
      for (const d of final) {
        for (let i = 0; i < perDay; i++) {
          result.items.push({ date: d, kind: "final_revision", minutes: each, topicId: all[k % all.length].id, revInterval: null });
          k++;
        }
      }
    } else {
      for (const d of final) result.items.push({ date: d, kind: "final_revision", minutes: dailyMinutes, topicId: null, revInterval: null });
    }
  }

  result.items.sort((a, b) => a.date - b.date || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return result;
}
