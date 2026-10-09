// Typed client for the FastAPI backend.

export type Strength = "weak" | "neutral" | "strong";
export type Kind = "learn" | "revise" | "buffer" | "final_revision";

export interface ParsedTopic { name: string; difficulty: number; est_minutes: number }
export interface ParsedUnit { name: string; topics: ParsedTopic[] }
export interface ParsedSubject { name: string; units: ParsedUnit[]; strength?: Strength }
export interface ParsedSyllabus { subjects: ParsedSubject[]; source: "ai" | "demo" }

export interface Topic extends ParsedTopic { id: number; status: "pending" | "done"; completed_at: string | null }
export interface Unit { id: number; name: string; topics: Topic[] }
export interface Subject { id: number; name: string; strength: Strength; color: string; units: Unit[] }
export interface Plan {
  id: number;
  exam_date: string;
  daily_minutes: number;
  version: number;
  required_daily_minutes: number | null;
  subjects: Subject[];
}

export interface Item {
  id: number;
  date: string;
  kind: Kind;
  minutes: number;
  status: "pending" | "done" | "missed";
  rev_interval: number | null;
  topic_id: number | null;
  topic: string | null;
  topic_status: "pending" | "done" | null;
  unit: string | null;
  subject: string | null;
  subject_id: number | null;
  color: string | null;
}

export interface TodayView {
  date: string;
  exam_date: string;
  days_left: number;
  daily_minutes: number;
  required_daily_minutes: number | null;
  replanned: { version: number; missed: number; overloaded: boolean } | null;
  items: Item[];
  tomorrow: Item[];
}

export interface QuizQuestion {
  id: number;
  position: number;
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: string[];
  chosen_index: number | null;
  correct_index?: number;
  explanation?: string;
}
export interface Quiz {
  id: number;
  topic_id: number;
  topic: string;
  unit: string;
  subject: string;
  submitted: boolean;
  score: number | null;
  total: number;
  sources: { url: string; title: string }[];
  questions: QuizQuestion[];
}

export interface TopicStat {
  id: number; name: string; unit: string; subject: string; subject_id: number; color: string;
  status: "pending" | "done"; difficulty: number; accuracy: number | null; best_accuracy: number | null;
  attempts: number; missed: number;
}
export interface SubjectStat {
  id: number; name: string; color: string; strength: Strength; topics: number; topics_done: number;
  completion_pct: number; accuracy: number | null; sessions: { planned: number; done: number; missed: number };
}
export interface Stats {
  overall: {
    completion_pct: number; topics: number; topics_done: number; streak: number; best_streak: number;
    accuracy: number | null; quizzes_taken: number; days_left: number; exam_date: string; daily_minutes: number;
    required_daily_minutes: number | null; minutes_done_total: number; sessions_missed_total: number;
    today_planned: number; today_done: number;
  };
  accuracy_by_difficulty: { easy: number | null; medium: number | null; hard: number | null };
  subjects: SubjectStat[];
  topics: TopicStat[];
  weak_topics: TopicStat[];
  planned_vs_actual: { date: string; planned: number; actual: number }[];
}

export interface Review {
  id: number; week_start: string; verdict: string; findings: string[]; actions: string[]; created_at: string;
}

export interface Me {
  id: number;
  email: string;
  name: string;
  ai: { mode: "live" | "demo"; limit: number | null; used_today: number };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "Can't reach the StudyFlow server. Is the backend running?");
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail)) msg = body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch { /* not JSON */ }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  me: () => request<Me>("/api/auth/me"),
  signup: (body: { name: string; email: string; password: string }) =>
    request<Me>("/api/auth/signup", { method: "POST", body: json(body) }),
  login: (body: { email: string; password: string }) => request<Me>("/api/auth/login", { method: "POST", body: json(body) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  deleteAccount: (password: string) => request<{ ok: boolean }>("/api/auth/me", { method: "DELETE", body: json({ password }) }),
  health: () => request<{ ai_mode: "live" | "demo"; model: string; daily_ai_limit: number | null }>("/api/health"),
  parseText: (text: string) => request<ParsedSyllabus>("/api/syllabus/parse", { method: "POST", body: json({ text }) }),
  parsePdf: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ParsedSyllabus>("/api/syllabus/parse-pdf", { method: "POST", body: fd });
  },
  createPlan: (body: { exam_date: string; daily_hours: number; subjects: ParsedSubject[] }) =>
    request<Plan>("/api/plans", { method: "POST", body: json(body) }),
  plan: () => request<Plan>("/api/plans/active"),
  replan: () => request<{ version: number }>("/api/plans/active/replan", { method: "POST" }),
  today: () => request<TodayView>("/api/schedule/today"),
  schedule: (from: string, to: string) =>
    request<{ exam_date: string; today: string; items: Item[] }>(`/api/schedule?from=${from}&to=${to}`),
  setItem: (id: number, status: "done" | "pending") =>
    request<{ item: Item; topic_completed: boolean; topic_id: number | null }>(`/api/schedule/${id}`, {
      method: "PATCH", body: json({ status }),
    }),
  completeTopic: (id: number) => request<{ version: number }>(`/api/topics/${id}/complete`, { method: "POST" }),
  createQuiz: (topic_id: number) => request<Quiz>("/api/quizzes", { method: "POST", body: json({ topic_id }) }),
  submitQuiz: (id: number, answers: (number | null)[]) =>
    request<Quiz>(`/api/quizzes/${id}/submit`, { method: "POST", body: json({ answers }) }),
  quizzes: (topicId?: number) =>
    request<{ id: number; topic_id: number; topic: string; subject: string; score: number; total: number; submitted_at: string }[]>(
      `/api/quizzes${topicId ? `?topic_id=${topicId}` : ""}`,
    ),
  stats: () => request<Stats>("/api/stats"),
  reviews: () => request<Review[]>("/api/reviews"),
  createReview: () => request<Review>("/api/reviews", { method: "POST" }),
};
