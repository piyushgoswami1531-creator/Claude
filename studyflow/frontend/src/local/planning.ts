/** Port of backend/app/services/planning.py, operating on the in-page store. */
import { dayOf, isoOf, nowStamp, stampDay, type Day } from "./days";
import { buildSchedule, MIN_CHUNK, REVISION_INTERVALS, revisionMinutes, weightedMinutes, type SeedRevision, type TopicIn } from "./scheduler";
import { newId, persist, state, type ItemRow, type SubjectRow, type TopicRow, type UnitRow } from "./store";

export function* iterTopics(): Generator<[SubjectRow, UnitRow, TopicRow, number]> {
  let order = 0;
  for (const s of [...state.subjects].sort((a, b) => a.position - b.position)) {
    for (const u of state.units.filter((x) => x.subject_id === s.id).sort((a, b) => a.position - b.position)) {
      for (const t of state.topics.filter((x) => x.unit_id === u.id).sort((a, b) => a.position - b.position)) {
        yield [s, u, t, order++];
      }
    }
  }
}

export interface PlanInput {
  exam_date: string;
  daily_hours: number;
  subjects: { name: string; strength?: string; units: { name: string; topics: { name: string; difficulty: number; est_minutes: number }[] }[] }[];
}

export function createPlan(data: PlanInput, today: Day) {
  // A new plan replaces the old one (and its quizzes and reviews).
  for (const q of state.quizzes) persist.deleteQuiz(q.id);
  for (const r of state.reviews) persist.deleteReview(r.id);
  state.quizzes = [];
  state.reviews = [];
  state.subjects = [];
  state.units = [];
  state.topics = [];
  state.items = [];

  state.plan = {
    id: newId(), exam_date: data.exam_date, daily_minutes: Math.round((Math.round(data.daily_hours * 4) / 4) * 60),
    version: 0, required_daily_minutes: null, created_at: nowStamp(),
  };
  data.subjects.forEach((s, si) => {
    const sid = newId();
    state.subjects.push({ id: sid, name: s.name.trim(), strength: (["weak", "neutral", "strong"].includes(s.strength ?? "") ? s.strength : "neutral") as SubjectRow["strength"], color: `c${(si % 8) + 1}`, position: si });
    s.units.forEach((u, ui) => {
      const uid = newId();
      state.units.push({ id: uid, subject_id: sid, name: u.name.trim(), position: ui });
      u.topics.forEach((t, ti) => {
        state.topics.push({
          id: newId(), unit_id: uid, name: t.name.trim(), difficulty: Math.min(5, Math.max(1, Math.round(t.difficulty))),
          est_minutes: Math.min(600, Math.max(10, Math.round(t.est_minutes))), status: "pending", completed_at: null, position: ti,
        });
      });
    });
  });
  replan(today);
}

function markMissed(today: Day): number {
  let n = 0;
  for (const i of state.items) {
    if (i.status === "pending" && dayOf(i.date) < today) {
      i.status = "missed";
      if (i.kind !== "buffer") n++;
    }
  }
  return n;
}

export function replan(today: Day) {
  const plan = state.plan!;
  const missed = markMissed(today);
  state.items = state.items.filter((i) => !(i.status === "pending" && dayOf(i.date) >= today));

  const learned = new Map<number, number>();
  const doneRevs = new Set<string>();
  for (const i of state.items) {
    if (i.status !== "done" || i.topic_id === null) continue;
    if (i.kind === "learn") learned.set(i.topic_id, (learned.get(i.topic_id) ?? 0) + i.minutes);
    if (i.kind === "revise") doneRevs.add(`${i.topic_id}:${i.rev_interval}`);
  }

  const topics: TopicIn[] = [];
  const seeds: SeedRevision[] = [];
  for (const [s, , t, order] of iterTopics()) {
    const full = weightedMinutes(t.est_minutes, t.difficulty, s.strength);
    let remaining: number;
    if (t.status === "done") {
      remaining = 0;
      if (t.completed_at) {
        const finished = stampDay(t.completed_at);
        for (const interval of REVISION_INTERVALS) {
          if (!doneRevs.has(`${t.id}:${interval}`)) {
            seeds.push({ due: Math.max(finished + interval, today), topicId: t.id, minutes: revisionMinutes(full), interval });
          }
        }
      }
    } else {
      remaining = Math.max(MIN_CHUNK, full - (learned.get(t.id) ?? 0));
    }
    topics.push({ id: t.id, subjectId: s.id, strength: s.strength, minutes: remaining, difficulty: t.difficulty, order, fullMinutes: full });
  }

  const usedToday = state.items.filter((i) => dayOf(i.date) === today && i.status === "done").reduce((n, i) => n + i.minutes, 0);
  const result = buildSchedule(topics, today, dayOf(plan.exam_date), plan.daily_minutes, seeds, usedToday);

  plan.version += 1;
  plan.required_daily_minutes = result.overloaded ? result.requiredDailyMinutes : null;
  for (const it of result.items) {
    state.items.push({
      id: newId(), date: isoOf(it.date), topic_id: it.topicId, kind: it.kind, rev_interval: it.revInterval,
      minutes: it.minutes, status: "pending", plan_version: plan.version, completed_at: null,
    });
  }
  persist.state();
  persist.schedule();
  return { version: plan.version, missed, overloaded: result.overloaded };
}

/** Re-plan only if something in the past was left undone. Idempotent. */
export function autoReplan(today: Day) {
  const stale = state.items.some((i) => i.status === "pending" && dayOf(i.date) < today);
  return stale ? replan(today) : null;
}

export function setItemStatus(item: ItemRow, done: boolean) {
  const now = nowStamp();
  let topicCompleted = false;
  item.status = done ? "done" : "pending";
  item.completed_at = done ? now : null;

  if (item.kind === "learn" && item.topic_id !== null) {
    const topic = state.topics.find((t) => t.id === item.topic_id)!;
    if (done) {
      const open = state.items.some((i) => i.topic_id === topic.id && i.kind === "learn" && i.status === "pending" && i.id !== item.id);
      if (!open && topic.status !== "done") {
        topic.status = "done";
        topic.completed_at = now;
        topicCompleted = true;
      }
    } else if (topic.status === "done") {
      topic.status = "pending";
      topic.completed_at = null;
    }
    persist.state();
  }
  persist.schedule();
  return { topic_completed: topicCompleted, topic_id: topicCompleted ? item.topic_id : null };
}

export function completeTopic(topic: TopicRow, today: Day) {
  const now = nowStamp();
  for (const i of state.items) {
    if (i.topic_id === topic.id && i.kind === "learn" && i.status === "pending" && dayOf(i.date) === today) {
      i.status = "done";
      i.completed_at = now;
    }
  }
  topic.status = "done";
  topic.completed_at = now;
  return replan(today);
}
