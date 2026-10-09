/**
 * The in-page backend for the phone (Artifact) build: the same functions and
 * response shapes as the FastAPI routes, backed by the in-page store.
 */
import type { Api, Item, Me, Plan, Quiz, Review, TodayView } from "../lib/api";
import { ApiError } from "../lib/errors";
import * as ai from "./ai";
import { dayOf, isoOf, nowStamp, todayDay } from "./days";
import * as planning from "./planning";
import * as stats from "./stats";
import { init, newId, persist, state, viewer, type ItemRow, type QuizRow, type ReviewRow } from "./store";

const MAX_DAYS = 365;

function topicIndex() {
  const out = new Map<number, Record<string, unknown>>();
  for (const [s, u, t] of planning.iterTopics()) {
    out.set(t.id, { topic: t.name, topic_status: t.status, unit: u.name, subject: s.name, subject_id: s.id, color: s.color });
  }
  return out;
}

function itemOut(i: ItemRow, index = topicIndex()): Item {
  const m = (i.topic_id !== null && index.get(i.topic_id)) || {};
  return {
    id: i.id, date: i.date, kind: i.kind, minutes: i.minutes, status: i.status, rev_interval: i.rev_interval, topic_id: i.topic_id,
    topic: (m.topic as string) ?? null, topic_status: (m.topic_status as Item["topic_status"]) ?? null, unit: (m.unit as string) ?? null,
    subject: (m.subject as string) ?? null, subject_id: (m.subject_id as number) ?? null, color: (m.color as string) ?? null,
  };
}

function planOut(): Plan {
  const p = state.plan!;
  const subs = [...state.subjects].sort((a, b) => a.position - b.position);
  return {
    id: p.id, exam_date: p.exam_date, daily_minutes: p.daily_minutes, version: p.version, required_daily_minutes: p.required_daily_minutes,
    subjects: subs.map((s) => ({
      id: s.id, name: s.name, strength: s.strength, color: s.color,
      units: state.units.filter((u) => u.subject_id === s.id).sort((a, b) => a.position - b.position).map((u) => ({
        id: u.id, name: u.name,
        topics: state.topics.filter((t) => t.unit_id === u.id).sort((a, b) => a.position - b.position).map((t) => ({
          id: t.id, name: t.name, difficulty: t.difficulty, est_minutes: t.est_minutes, status: t.status, completed_at: t.completed_at,
        })),
      })),
    })),
  };
}

function quizOut(q: QuizRow, reveal: boolean): Quiz {
  const t = state.topics.find((x) => x.id === q.topic_id)!;
  const u = state.units.find((x) => x.id === t.unit_id)!;
  const s = state.subjects.find((x) => x.id === u.subject_id)!;
  return {
    id: q.id, topic_id: q.topic_id, topic: t.name, unit: u.name, subject: s.name, submitted: !!q.submitted_at,
    score: q.score, total: q.total, sources: q.sources,
    questions: q.questions.map((x) => ({
      id: x.id, position: x.position, difficulty: x.difficulty, question: x.stem, options: x.options, chosen_index: x.chosen_index,
      ...(reveal ? { correct_index: x.correct_index, explanation: x.explanation } : {}),
    })),
  };
}

const reviewOut = (r: ReviewRow): Review => ({
  id: r.id, week_start: r.week_start, verdict: r.verdict, findings: r.findings, actions: r.actions, created_at: r.created_at,
});

async function requirePlan() {
  await init();
  if (!state.plan) throw new ApiError(404, "No study plan yet. Create one first.");
  return state.plan;
}

const ownedTopic = (id: number) => {
  const t = state.topics.find((x) => x.id === id);
  if (!t) throw new ApiError(404, "Topic not found.");
  return t;
};

// Serialize mutations so two quick taps can't interleave half-applied changes.
let chain: Promise<unknown> = Promise.resolve();
const serial = <T,>(fn: () => Promise<T> | T): Promise<T> => {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
};

export const localApi: Api = {
  async me(): Promise<Me> {
    await init();
    return {
      id: 0, email: "", name: viewer.name || "Student", ai: { mode: await ai.aiMode(), limit: null, used_today: 0 },
      storage: viewer.storage === "cloud" ? "cloud" : "device",
    };
  },
  signup: async () => localApi.me(),
  login: async () => localApi.me(),
  logout: async () => ({ ok: true }),
  deleteAccount: () =>
    serial(async () => {
      await init();
      await persist.wipe();
      Object.assign(state, { plan: null, subjects: [], units: [], topics: [], items: [], quizzes: [], reviews: [], nextId: 1 });
      return { ok: true };
    }),
  health: async () => ({ ai_mode: await ai.aiMode(), model: "claude", daily_ai_limit: null }),

  parseText: async (text) => ai.parseSyllabus(text),
  parsePdf: async () => {
    throw new ApiError(415, "PDF upload isn't available in the phone version. Copy the text from your PDF and paste it instead.");
  },

  createPlan: (body) =>
    serial(async () => {
      await init();
      const today = todayDay();
      const exam = dayOf(body.exam_date);
      if (exam <= today) throw new ApiError(422, "The exam date must be in the future.");
      if (exam - today > MAX_DAYS) throw new ApiError(422, "Pick an exam date within the next 12 months.");
      if (!body.subjects.length) throw new ApiError(422, "Add at least one subject.");
      planning.createPlan(body, today);
      return planOut();
    }),
  plan: async () => {
    await requirePlan();
    return planOut();
  },
  replan: () =>
    serial(async () => {
      await requirePlan();
      return planning.replan(todayDay());
    }),

  today: () =>
    serial(async (): Promise<TodayView> => {
      const plan = await requirePlan();
      const today = todayDay();
      const replanned = planning.autoReplan(today);
      const index = topicIndex();
      const on = (d: number) => state.items.filter((i) => dayOf(i.date) === d).sort((a, b) => a.id - b.id).map((i) => itemOut(i, index));
      return {
        date: isoOf(today), exam_date: plan.exam_date, days_left: dayOf(plan.exam_date) - today, daily_minutes: plan.daily_minutes,
        required_daily_minutes: plan.required_daily_minutes, replanned, items: on(today), tomorrow: on(today + 1),
      };
    }),
  schedule: (from, to) =>
    serial(async () => {
      const plan = await requirePlan();
      const today = todayDay();
      planning.autoReplan(today);
      const a = dayOf(from), b = dayOf(to);
      if (b < a || b - a > 120) throw new ApiError(422, "Range must be 0-120 days.");
      const index = topicIndex();
      const items = state.items
        .filter((i) => { const d = dayOf(i.date); return d >= a && d <= b; })
        .sort((x, y) => x.date.localeCompare(y.date) || x.id - y.id)
        .map((i) => itemOut(i, index));
      return { exam_date: plan.exam_date, today: isoOf(today), items };
    }),
  setItem: (id, status) =>
    serial(async () => {
      await requirePlan();
      const item = state.items.find((i) => i.id === id);
      if (!item) throw new ApiError(404, "Session not found.");
      if (dayOf(item.date) > todayDay() && status === "done") throw new ApiError(422, "You can't complete a future session. Use 'Finish topic' to get ahead.");
      if (item.status === "missed" && status === "done") throw new ApiError(422, "That session was missed and has already been re-planned.");
      const info = planning.setItemStatus(item, status === "done");
      return { item: itemOut(item), ...info };
    }),
  completeTopic: (id) =>
    serial(async () => {
      const plan = await requirePlan();
      const topic = ownedTopic(id);
      if (topic.status === "done") return { version: plan.version };
      return planning.completeTopic(topic, todayDay());
    }),

  async createQuiz(topicId) {
    const plan = await requirePlan();
    const topic = ownedTopic(topicId);
    const open = state.quizzes.filter((q) => q.topic_id === topic.id && !q.submitted_at).sort((a, b) => b.id - a.id)[0];
    if (open) return quizOut(open, false);
    const unit = state.units.find((u) => u.id === topic.unit_id)!;
    const subject = state.subjects.find((s) => s.id === unit.subject_id)!;
    const attempt = state.quizzes.filter((q) => q.topic_id === topic.id).length;
    // Generation can take a minute; only the save is serialized, so the rest of the app stays responsive.
    const questions = await ai.generateQuiz(subject.name, unit.name, topic.name, attempt);
    return serial(() => {
      if (state.plan?.id !== plan.id) throw new ApiError(409, "Your plan changed while the quiz was being written.");
      const quiz: QuizRow = {
        id: newId(), plan_id: plan.id, topic_id: topic.id, created_at: nowStamp(), submitted_at: null, score: null,
        total: questions.length, sources: [],
        questions: questions.map((q, i) => ({
          id: newId(), position: i, difficulty: q.difficulty, stem: q.question, options: q.options,
          correct_index: q.correct_index, explanation: q.explanation, chosen_index: null,
        })),
      };
      state.quizzes.push(quiz);
      persist.state(); // id counter moved
      persist.quiz(quiz);
      return quizOut(quiz, false);
    });
  },
  submitQuiz: (id, answers) =>
    serial(async () => {
      await requirePlan();
      const quiz = state.quizzes.find((q) => q.id === id);
      if (!quiz) throw new ApiError(404, "Quiz not found.");
      if (quiz.submitted_at) throw new ApiError(409, "This quiz was already submitted.");
      if (answers.length !== quiz.questions.length) throw new ApiError(422, `Expected ${quiz.questions.length} answers.`);
      let score = 0;
      quiz.questions.forEach((q, i) => {
        const a = answers[i];
        if (a !== null && (a < 0 || a >= q.options.length)) throw new ApiError(422, "Answer index out of range.");
        q.chosen_index = a;
        score += Number(a === q.correct_index);
      });
      quiz.score = score;
      quiz.submitted_at = nowStamp();
      persist.quiz(quiz);
      return quizOut(quiz, true);
    }),
  quizzes: async (topicId) => {
    await requirePlan();
    return state.quizzes
      .filter((q) => q.submitted_at && (topicId === undefined || q.topic_id === topicId))
      .sort((a, b) => b.submitted_at!.localeCompare(a.submitted_at!))
      .map((q) => {
        const t = state.topics.find((x) => x.id === q.topic_id)!;
        const s = state.subjects.find((x) => x.id === state.units.find((u) => u.id === t.unit_id)!.subject_id)!;
        return { id: q.id, topic_id: q.topic_id, topic: t.name, subject: s.name, score: q.score ?? 0, total: q.total, submitted_at: q.submitted_at! };
      });
  },

  stats: () =>
    serial(async () => {
      await requirePlan();
      const today = todayDay();
      planning.autoReplan(today);
      return stats.compute(today);
    }),
  reviews: async () => {
    const plan = await requirePlan();
    return state.reviews.filter((r) => r.plan_id === plan.id).sort((a, b) => b.id - a.id).map(reviewOut);
  },
  async createReview() {
    const plan = await requirePlan();
    const today = todayDay();
    const week = await serial(() => {
      planning.autoReplan(today);
      return stats.weekly(today);
    });
    const out = await ai.generateReview(week);
    return serial(() => {
      const r: ReviewRow = {
        id: newId(), plan_id: plan.id, week_start: isoOf(today - 6), stats: week, verdict: out.verdict,
        findings: out.findings, actions: out.actions, created_at: nowStamp(),
      };
      state.reviews.push(r);
      persist.state();
      persist.review(r);
      return reviewOut(r);
    });
  },
};
