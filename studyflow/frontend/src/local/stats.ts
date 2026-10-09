/** Port of backend/app/services/stats.py. Every dashboard and review number comes from here. */
import type { Stats, TopicStat } from "../lib/api";
import { dayOf, isoOf, stampDay, type Day } from "./days";
import { iterTopics } from "./planning";
import { state } from "./store";

const WEAK_ACCURACY = 60;
const WEAK_MISSED = 2;
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);

export function streak(done: Set<Day>, today: Day) {
  let day = done.has(today) ? today : today - 1;
  let n = 0;
  while (done.has(day)) {
    n++;
    day--;
  }
  return n;
}

export function bestStreak(done: Set<Day>) {
  let best = 0, run = 0, prev: Day | null = null;
  for (const d of [...done].sort((a, b) => a - b)) {
    run = prev !== null && d - prev === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

const submittedQuizzes = () => state.quizzes.filter((q) => q.submitted_at).sort((a, b) => a.submitted_at!.localeCompare(b.submitted_at!));

export function compute(today: Day): Stats {
  const plan = state.plan!;
  const items = state.items;
  const rows = [...iterTopics()];
  const attemptsBy = new Map<number, typeof state.quizzes>();
  for (const q of submittedQuizzes()) {
    if (!attemptsBy.has(q.topic_id)) attemptsBy.set(q.topic_id, []);
    attemptsBy.get(q.topic_id)!.push(q);
  }

  const doneDates = new Set(items.filter((i) => i.status === "done" && i.completed_at && i.kind !== "buffer").map((i) => stampDay(i.completed_at!)));
  const missedBy = new Map<number, number>();
  for (const i of items) if (i.status === "missed" && i.topic_id !== null) missedBy.set(i.topic_id, (missedBy.get(i.topic_id) ?? 0) + 1);

  const topics: TopicStat[] = rows.map(([s, u, t]) => {
    const attempts = attemptsBy.get(t.id) ?? [];
    const latest = attempts[attempts.length - 1];
    return {
      id: t.id, name: t.name, unit: u.name, subject: s.name, subject_id: s.id, color: s.color,
      status: t.status, difficulty: t.difficulty,
      accuracy: latest ? pct(latest.score ?? 0, latest.total) : null,
      best_accuracy: attempts.length ? Math.max(...attempts.map((a) => pct(a.score ?? 0, a.total) ?? 0)) : null,
      attempts: attempts.length,
      missed: missedBy.get(t.id) ?? 0,
    };
  });

  const weak_topics = topics
    .filter((t) => (t.accuracy !== null && t.accuracy < WEAK_ACCURACY) || t.missed >= WEAK_MISSED)
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || b.missed - a.missed);

  const topicSubject = new Map(topics.map((t) => [t.id, t.subject_id]));
  const sess = new Map<number, { planned: number; done: number; missed: number }>();
  for (const i of items) {
    if (i.kind === "buffer" || i.topic_id === null) continue;
    const sid = topicSubject.get(i.topic_id);
    if (sid === undefined || (dayOf(i.date) >= today && i.status !== "done")) continue;
    if (!sess.has(sid)) sess.set(sid, { planned: 0, done: 0, missed: 0 });
    const e = sess.get(sid)!;
    e.planned++;
    if (i.status === "done") e.done++;
    else if (i.status === "missed") e.missed++;
  }

  const subjects = [...state.subjects].sort((a, b) => a.position - b.position).map((s) => {
    const ts = topics.filter((t) => t.subject_id === s.id);
    const scored = ts.map((t) => t.accuracy).filter((a): a is number => a !== null);
    const done = ts.filter((t) => t.status === "done").length;
    return {
      id: s.id, name: s.name, color: s.color, strength: s.strength, topics: ts.length, topics_done: done,
      completion_pct: pct(done, ts.length) ?? 0,
      accuracy: scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
      sessions: sess.get(s.id) ?? { planned: 0, done: 0, missed: 0 },
    };
  });

  const plannedBy = new Map<Day, number>();
  const actualBy = new Map<Day, number>();
  for (const i of items) {
    if (i.kind === "buffer") continue;
    const d = dayOf(i.date);
    plannedBy.set(d, (plannedBy.get(d) ?? 0) + i.minutes);
    if (i.status === "done" && i.completed_at) {
      const c = stampDay(i.completed_at);
      actualBy.set(c, (actualBy.get(c) ?? 0) + i.minutes);
    }
  }
  const planned_vs_actual = Array.from({ length: 14 }, (_, k) => today - 13 + k).map((d) => ({
    date: isoOf(d), planned: plannedBy.get(d) ?? 0, actual: actualBy.get(d) ?? 0,
  }));

  const attempts = submittedQuizzes().filter((q) => topicSubject.has(q.topic_id));
  const totalQ = attempts.reduce((n, a) => n + a.total, 0);
  const diff = { easy: [0, 0], medium: [0, 0], hard: [0, 0] } as Record<string, [number, number]>;
  for (const q of attempts) for (const x of q.questions) {
    diff[x.difficulty][1]++;
    diff[x.difficulty][0] += Number(x.chosen_index === x.correct_index);
  }
  const todayItems = items.filter((i) => dayOf(i.date) === today && i.kind !== "buffer");
  const done = topics.filter((t) => t.status === "done").length;

  return {
    overall: {
      completion_pct: pct(done, topics.length) ?? 0,
      topics: topics.length,
      topics_done: done,
      streak: streak(doneDates, today),
      best_streak: bestStreak(doneDates),
      accuracy: pct(attempts.reduce((n, a) => n + (a.score ?? 0), 0), totalQ),
      quizzes_taken: attempts.length,
      days_left: Math.max(0, dayOf(plan.exam_date) - today),
      exam_date: plan.exam_date,
      daily_minutes: plan.daily_minutes,
      required_daily_minutes: plan.required_daily_minutes,
      minutes_done_total: items.filter((i) => i.status === "done" && i.kind !== "buffer").reduce((n, i) => n + i.minutes, 0),
      sessions_missed_total: items.filter((i) => i.status === "missed" && i.kind !== "buffer").length,
      today_planned: todayItems.reduce((n, i) => n + i.minutes, 0),
      today_done: todayItems.filter((i) => i.status === "done").reduce((n, i) => n + i.minutes, 0),
    },
    accuracy_by_difficulty: {
      easy: pct(diff.easy[0], diff.easy[1]), medium: pct(diff.medium[0], diff.medium[1]), hard: pct(diff.hard[0], diff.hard[1]),
    },
    subjects,
    topics,
    weak_topics,
    planned_vs_actual,
  };
}

/** Last-7-days stats for the blunt review (compact: it's sent to Claude). */
export function weekly(today: Day) {
  const start = today - 6;
  const full = compute(today);
  const meta = new Map([...iterTopics()].map(([s, , t]) => [t.id, { s, t }]));

  const per = new Map<number, { name: string; strength: string; planned: number; done: number; missed: number; pd: Set<Day>; md: Set<Day> }>();
  for (const s of state.subjects) per.set(s.id, { name: s.name, strength: s.strength, planned: 0, done: 0, missed: 0, pd: new Set(), md: new Set() });
  for (const i of state.items) {
    const d = dayOf(i.date);
    if (i.kind === "buffer" || d < start || d > today || i.topic_id === null || !meta.has(i.topic_id)) continue;
    if (d === today && i.status === "pending") continue;
    const p = per.get(meta.get(i.topic_id)!.s.id)!;
    p.planned++;
    p.pd.add(d);
    if (i.status === "done") p.done++;
    else if (i.status === "missed") {
      p.missed++;
      p.md.add(d);
    }
  }
  const subjects = [...per.values()].map(({ pd, md, ...rest }) => ({ ...rest, days_planned: pd.size, days_with_misses: md.size }));

  const quizzes = submittedQuizzes()
    .filter((q) => meta.has(q.topic_id) && stampDay(q.submitted_at!) >= start)
    .map((q) => {
      const { s, t } = meta.get(q.topic_id)!;
      return { subject: s.name, topic: t.name, accuracy: pct(q.score ?? 0, q.total) };
    });
  const finished = [...meta.values()]
    .filter(({ t }) => t.status === "done" && t.completed_at && stampDay(t.completed_at) >= start && stampDay(t.completed_at) <= today)
    .map(({ t }) => t.name);
  const last7 = full.planned_vs_actual.slice(-7);
  const o = full.overall;
  return {
    period: { from: isoOf(start), to: isoOf(today) },
    week: {
      sessions_planned: subjects.reduce((n, s) => n + s.planned, 0),
      sessions_done: subjects.reduce((n, s) => n + s.done, 0),
      sessions_missed: subjects.reduce((n, s) => n + s.missed, 0),
      minutes_planned: last7.reduce((n, d) => n + d.planned, 0),
      minutes_done: last7.reduce((n, d) => n + d.actual, 0),
      topics_finished: finished,
      finished_but_not_quizzed: finished.filter((n) => !quizzes.some((q) => q.topic === n)),
      quizzes,
    },
    subjects,
    weak_topics: full.weak_topics.slice(0, 6).map((t) => ({ subject: t.subject, topic: t.name, accuracy: t.accuracy, missed_sessions: t.missed })),
    overall: {
      completion_pct: o.completion_pct, topics: o.topics, topics_done: o.topics_done, streak: o.streak, accuracy: o.accuracy,
      days_left: o.days_left, exam_date: o.exam_date, daily_minutes: o.daily_minutes, required_daily_minutes: o.required_daily_minutes,
    },
  };
}

export type WeeklyStats = ReturnType<typeof weekly>;
