/**
 * In-page data store for the phone (Artifact) build.
 *
 * Mirrors the server's tables as plain arrays. Persists to the artifact's
 * private per-user `db` subtree when the viewer provides one, else to
 * localStorage (e.g. a local preview). Layout (all under data/users/<id>/):
 *   state                 plan + subjects/units/topics + id counter
 *   schedule              every schedule item, packed as tuples
 *   state/quizzes/<id>    one document per quiz
 *   state/reviews/<id>    one document per weekly review
 */
import type { Kind, Strength } from "./scheduler";

export interface PlanRow {
  id: number; exam_date: string; daily_minutes: number; version: number;
  required_daily_minutes: number | null; created_at: string;
}
export interface SubjectRow { id: number; name: string; strength: Strength; color: string; position: number }
export interface UnitRow { id: number; subject_id: number; name: string; position: number }
export interface TopicRow {
  id: number; unit_id: number; name: string; difficulty: number; est_minutes: number;
  status: "pending" | "done"; completed_at: string | null; position: number;
}
export interface ItemRow {
  id: number; date: string; topic_id: number | null; kind: Kind; rev_interval: number | null;
  minutes: number; status: "pending" | "done" | "missed"; plan_version: number; completed_at: string | null;
}
export interface QuestionRow {
  id: number; position: number; difficulty: "easy" | "medium" | "hard"; stem: string; options: string[];
  correct_index: number; explanation: string; chosen_index: number | null;
}
export interface QuizRow {
  id: number; plan_id: number; topic_id: number; created_at: string; submitted_at: string | null;
  score: number | null; total: number; sources: { url: string; title: string }[]; questions: QuestionRow[];
}
export interface ReviewRow {
  id: number; plan_id: number; week_start: string; stats: unknown; verdict: string;
  findings: string[]; actions: string[]; created_at: string;
}

export interface State {
  plan: PlanRow | null;
  subjects: SubjectRow[];
  units: UnitRow[];
  topics: TopicRow[];
  items: ItemRow[];
  quizzes: QuizRow[];
  reviews: ReviewRow[];
  nextId: number;
}

export const state: State = { plan: null, subjects: [], units: [], topics: [], items: [], quizzes: [], reviews: [], nextId: 1 };
export const newId = () => state.nextId++;

// ---------------------------------------------------------------- viewer ---
type DbDoc = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void>; collection(p: string): DbCol };
type DbCol = { doc(id?: string): DbDoc; get(): Promise<{ docs: { id: string; data(): Record<string, unknown> | undefined }[] }> };
type Db = { doc(p: string): DbDoc };

interface Backend {
  load(): Promise<void>;
  saveState(): void;
  saveSchedule(): void;
  saveQuiz(q: QuizRow): void;
  saveReview(r: ReviewRow): void;
  deleteQuiz(id: number): void;
  deleteReview(id: number): void;
  wipe(): Promise<void>;
}

export const viewer = { id: null as string | null, name: "", storage: "memory" as "cloud" | "device" | "memory" };

const MAX_DOC = 250_000;

class StoreFullError extends Error {}

/** One write at a time per document, always the latest body (bursts coalesce). */
class DocWriter {
  private pending: Record<string, unknown> | null = null;
  private running = false;
  constructor(private ref: DbDoc, private onError: (e: unknown) => void) {}
  write(body: Record<string, unknown>) {
    this.pending = body;
    if (!this.running) void this.flush();
  }
  private async flush() {
    this.running = true;
    while (this.pending) {
      const body = this.pending;
      this.pending = null;
      try {
        await this.ref.set(body);
      } catch (e) {
        this.onError(e);
      }
    }
    this.running = false;
  }
}

// Items are packed as tuples to keep the schedule document small.
const packItem = (i: ItemRow) => [i.id, i.date, i.topic_id, i.kind, i.rev_interval, i.minutes, i.status, i.plan_version, i.completed_at];
const unpackItem = (t: unknown[]): ItemRow => ({
  id: t[0] as number, date: t[1] as string, topic_id: t[2] as number | null, kind: t[3] as Kind,
  rev_interval: t[4] as number | null, minutes: t[5] as number, status: t[6] as ItemRow["status"],
  plan_version: t[7] as number, completed_at: t[8] as string | null,
});

const stateBody = () => ({ v: 1, plan: state.plan, subjects: state.subjects, units: state.units, topics: state.topics, nextId: state.nextId });
const scheduleBody = () => ({ v: 1, items: state.items.map(packItem) });

function applyState(d: Record<string, unknown> | undefined) {
  if (!d) return;
  state.plan = (d.plan as PlanRow) ?? null;
  state.subjects = (d.subjects as SubjectRow[]) ?? [];
  state.units = (d.units as UnitRow[]) ?? [];
  state.topics = (d.topics as TopicRow[]) ?? [];
  state.nextId = Math.max(1, Number(d.nextId) || 1);
}
const applySchedule = (d: Record<string, unknown> | undefined) => {
  state.items = ((d?.items as unknown[][]) ?? []).map(unpackItem);
};

let onSaveError: (msg: string) => void = () => {};
export const setSaveErrorHandler = (fn: (msg: string) => void) => (onSaveError = fn);

function checkSize(body: Record<string, unknown>) {
  if (JSON.stringify(body).length > MAX_DOC) throw new StoreFullError("This plan is too big to save. Try fewer topics or a closer exam date.");
}

function cloudBackend(db: Db, uid: string): Backend {
  const base = `data/users/${uid}`;
  const stateRef = db.doc(`${base}/state`);
  const scheduleRef = db.doc(`${base}/schedule`);
  const report = (e: unknown) => {
    const code = (e as { code?: string })?.code;
    onSaveError(code === "quota_exceeded" ? "Storage is full. Start a new plan to free space." : "Couldn't save your last change. Check your connection.");
  };
  const stateW = new DocWriter(stateRef, report);
  const schedW = new DocWriter(scheduleRef, report);
  const quizW = new Map<number, DocWriter>();
  const reviewW = new Map<number, DocWriter>();
  const writerFor = (map: Map<number, DocWriter>, col: string, id: number) => {
    if (!map.has(id)) map.set(id, new DocWriter(stateRef.collection(col).doc(String(id)), report));
    return map.get(id)!;
  };
  return {
    async load() {
      const [s, sch, qs, rs] = await Promise.all([
        stateRef.get(), scheduleRef.get(), stateRef.collection("quizzes").get(), stateRef.collection("reviews").get(),
      ]);
      if (s.exists) applyState(s.data());
      if (sch.exists) applySchedule(sch.data());
      state.quizzes = qs.docs.map((d) => d.data() as unknown as QuizRow).filter(Boolean);
      state.reviews = rs.docs.map((d) => d.data() as unknown as ReviewRow).filter(Boolean);
    },
    saveState: () => { const b = stateBody(); checkSize(b); stateW.write(b); },
    saveSchedule: () => { const b = scheduleBody(); checkSize(b); schedW.write(b); },
    saveQuiz: (q) => writerFor(quizW, "quizzes", q.id).write({ ...q }),
    saveReview: (r) => writerFor(reviewW, "reviews", r.id).write({ ...r }),
    deleteQuiz: (id) => void stateRef.collection("quizzes").doc(String(id)).delete().catch(report),
    deleteReview: (id) => void stateRef.collection("reviews").doc(String(id)).delete().catch(report),
    async wipe() {
      await Promise.all([
        ...state.quizzes.map((q) => stateRef.collection("quizzes").doc(String(q.id)).delete()),
        ...state.reviews.map((r) => stateRef.collection("reviews").doc(String(r.id)).delete()),
      ]);
      await stateRef.delete();
      await scheduleRef.delete();
    },
  };
}

function deviceBackend(): Backend {
  const KEY = "studyflow-lite";
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "null");
    } catch {
      return null;
    }
  };
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...stateBody(), ...scheduleBody(), quizzes: state.quizzes, reviews: state.reviews }));
    } catch {
      onSaveError("Couldn't save on this device (storage blocked or full).");
    }
  };
  return {
    async load() {
      const d = read();
      if (!d) return;
      applyState(d);
      applySchedule(d);
      state.quizzes = d.quizzes ?? [];
      state.reviews = d.reviews ?? [];
    },
    saveState: write, saveSchedule: write, saveQuiz: write, saveReview: write, deleteQuiz: write, deleteReview: write,
    async wipe() {
      try {
        localStorage.removeItem(KEY);
      } catch { /* ignore */ }
    },
  };
}

let backend: Backend = deviceBackend();
export const persist = {
  state: () => backend.saveState(),
  schedule: () => backend.saveSchedule(),
  quiz: (q: QuizRow) => backend.saveQuiz(q),
  review: (r: ReviewRow) => backend.saveReview(r),
  deleteQuiz: (id: number) => backend.deleteQuiz(id),
  deleteReview: (id: number) => backend.deleteReview(id),
  wipe: () => backend.wipe(),
};

type ClaudeUse = { use(name: string): Promise<unknown> };
export const claudeUse = <T,>(name: string): Promise<T | null> => {
  const c = (window as unknown as { claude?: ClaudeUse }).claude;
  return c?.use ? (c.use(name) as Promise<T | null>).catch(() => null) : Promise.resolve(null);
};

let ready: Promise<void> | null = null;

/** Connect to the viewer's storage and load saved data (once). */
export function init(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    type User = { id(): Promise<string | null>; name(): Promise<string> };
    const [user, db] = await Promise.all([claudeUse<User>("user"), claudeUse<Db>("db")]);
    viewer.id = user ? await user.id() : null;
    viewer.name = user ? (await user.name()) || "" : "";
    if (db && viewer.id) {
      try {
        const cloud = cloudBackend(db, viewer.id);
        await cloud.load();
        backend = cloud;
        viewer.storage = "cloud";
        return;
      } catch {
        /* fall through to device storage */
      }
    }
    backend = deviceBackend();
    await backend.load();
    viewer.storage = "device";
  })();
  return ready;
}

export { StoreFullError };

// ------------------------------------------------------------ backup file ---
const BACKUP_KIND = "studyflow-backup";

/** Everything needed to restore this device's data on another device. */
export function exportData() {
  return { kind: BACKUP_KIND, version: 1, exported_at: new Date().toISOString(), ...stateBody(), ...scheduleBody(), quizzes: state.quizzes, reviews: state.reviews };
}

/** Replace all data with a backup file's contents (after basic shape checks). */
export async function importData(raw: unknown): Promise<void> {
  const d = raw as Record<string, unknown>;
  const ok =
    d && d.kind === BACKUP_KIND && Array.isArray(d.subjects) && Array.isArray(d.units) && Array.isArray(d.topics) &&
    Array.isArray(d.items) && Array.isArray(d.quizzes) && Array.isArray(d.reviews);
  if (!ok) throw new Error("That file isn't a StudyFlow backup.");
  await backend.wipe();
  applyState(d);
  applySchedule(d);
  state.quizzes = d.quizzes as QuizRow[];
  state.reviews = d.reviews as ReviewRow[];
  backend.saveState();
  backend.saveSchedule();
  for (const q of state.quizzes) backend.saveQuiz(q);
  for (const r of state.reviews) backend.saveReview(r);
}
