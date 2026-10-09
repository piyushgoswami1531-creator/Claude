/**
 * The contract every AI answer must meet before it touches the store — the same
 * rules as backend/app/services/ai/schemas.py. Structural problems throw (so the
 * caller can ask Claude to fix them); harmless numeric drift is clamped.
 */
import type { ParsedSubject } from "../lib/api";

export class ValidationError extends Error {}

const clean = (s: unknown) => String(s ?? "").split(/\s+/).join(" ").trim();
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

export function syllabus(raw: unknown): ParsedSubject[] {
  if (!isObj(raw) || !Array.isArray(raw.subjects)) throw new ValidationError('expected {"subjects": [...]}');
  const subjects: ParsedSubject[] = [];
  for (const s of raw.subjects) {
    if (!isObj(s) || !Array.isArray(s.units)) continue;
    const units = [];
    for (const u of s.units) {
      if (!isObj(u) || !Array.isArray(u.topics)) continue;
      const topics = u.topics
        .filter(isObj)
        .map((t) => ({ name: clean(t.name).slice(0, 300), difficulty: clampInt(t.difficulty, 1, 5, 3), est_minutes: clampInt(t.est_minutes, 15, 300, 60) }))
        .filter((t) => t.name);
      const name = clean(u.name).slice(0, 200);
      if (topics.length && name) units.push({ name, topics });
    }
    const name = clean(s.name).slice(0, 200);
    if (units.length && name) subjects.push({ name, units });
  }
  if (!subjects.length) throw new ValidationError("no subjects with units and topics were found");
  if (subjects.length > 20) throw new ValidationError("more than 20 subjects");
  return subjects;
}

export interface MCQ { difficulty: "easy" | "medium" | "hard"; question: string; options: string[]; correct_index: number; explanation: string }
const MIX = { easy: 4, medium: 4, hard: 2 } as const;
const ORDER = { easy: 0, medium: 1, hard: 2 } as const;

export function quiz(raw: unknown): MCQ[] {
  if (!isObj(raw) || !Array.isArray(raw.questions)) throw new ValidationError('expected {"questions": [...]}');
  if (raw.questions.length !== 10) throw new ValidationError(`need exactly 10 questions, got ${raw.questions.length}`);
  const out: MCQ[] = raw.questions.map((q, i) => {
    const n = i + 1;
    if (!isObj(q)) throw new ValidationError(`question ${n} is not an object`);
    const difficulty = clean(q.difficulty).toLowerCase();
    if (!(difficulty in MIX)) throw new ValidationError(`question ${n}: difficulty must be easy, medium or hard`);
    const question = clean(q.question);
    if (question.length < 8) throw new ValidationError(`question ${n}: question text too short`);
    if (!Array.isArray(q.options) || q.options.length !== 4) throw new ValidationError(`question ${n}: needs exactly 4 options`);
    const options = q.options.map(clean);
    if (options.some((o) => !o)) throw new ValidationError(`question ${n}: options must be non-empty`);
    if (new Set(options.map((o) => o.toLowerCase())).size !== 4) throw new ValidationError(`question ${n}: options must be 4 distinct answers`);
    const ci = Number(q.correct_index);
    if (!Number.isInteger(ci) || ci < 0 || ci > 3) throw new ValidationError(`question ${n}: correct_index must be 0-3`);
    const explanation = clean(q.explanation);
    if (explanation.length < 10) throw new ValidationError(`question ${n}: explanation too short`);
    return { difficulty: difficulty as MCQ["difficulty"], question, options, correct_index: ci, explanation };
  });
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const q of out) counts[q.difficulty]++;
  if (counts.easy !== 4 || counts.medium !== 4 || counts.hard !== 2) {
    throw new ValidationError(`difficulty mix must be 4 easy / 4 medium / 2 hard, got ${JSON.stringify(counts)}`);
  }
  if (new Set(out.map((q) => q.question.toLowerCase())).size !== 10) throw new ValidationError("questions must not repeat");
  return out.sort((a, b) => ORDER[a.difficulty] - ORDER[b.difficulty]);
}

export interface ReviewOut { verdict: string; findings: string[]; actions: string[] }

export function review(raw: unknown): ReviewOut {
  if (!isObj(raw)) throw new ValidationError("expected an object");
  const verdict = clean(raw.verdict);
  if (verdict.length < 10 || verdict.length > 400) throw new ValidationError("verdict must be 10-400 characters");
  const list = (v: unknown, name: string, min: number, max: number) => {
    if (!Array.isArray(v)) throw new ValidationError(`${name} must be a list`);
    const items = v.map(clean);
    if (items.length < min || items.length > max) throw new ValidationError(`${name} must have ${min === max ? `exactly ${min}` : `${min}-${max}`} items`);
    if (items.some((x) => x.length < 8)) throw new ValidationError(`each of ${name} must be a real sentence`);
    return items;
  };
  return { verdict, findings: list(raw.findings, "findings", 2, 6), actions: list(raw.actions, "actions", 3, 3) };
}
