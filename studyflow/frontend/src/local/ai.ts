/**
 * Claude, from inside the page, on the viewer's own Claude account (`sample`).
 * Same contract as the server: ask for JSON, validate it, and on failure ask once
 * more with the exact validation error. If this view can't reach Claude (or the
 * viewer declines), fall back to the offline demo logic.
 */
import type { ParsedSubject } from "../lib/api";
import { ApiError } from "../lib/api";
import * as mock from "./mock";
import type { WeeklyStats } from "./stats";
import { claudeUse } from "./store";
import * as validate from "./validate";

type Sample = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json<T = unknown>(input: string, opts?: Record<string, unknown>): Promise<T>;
};

let sampleFn: Sample | null = null;
let declined = false;
const ready = claudeUse<Sample>("sample").then((s) => (sampleFn = s));

export async function aiMode(): Promise<"live" | "demo"> {
  await ready;
  return sampleFn && !declined ? "live" : "demo";
}

const GONE = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"]);

function friendly(code: string): string {
  switch (code) {
    case "rate_limited": return "You've hit Claude's usage limit for now. Try again in a little while.";
    case "session_expired": return "Your Claude session expired. Reload the page and sign in again.";
    case "refused": return "Claude declined this request. Try rephrasing it.";
    case "prompt_too_large": return "That syllabus is too long. Paste one subject at a time.";
    default: return "Couldn't reach Claude just now. Try again.";
  }
}

/** Ask for JSON and validate it; one repair round on bad data. Returns null when Claude isn't available here. */
async function askJson<T>(prompt: string, check: (raw: unknown) => T): Promise<T | null> {
  await ready;
  if (!sampleFn || declined) return null;
  const s = sampleFn;
  let raw: unknown;
  let rawText = "";
  let problem = "the reply was not a single valid JSON object";
  try {
    raw = await s.json(prompt, { modelTier: "default", cache: false });
  } catch (e) {
    const code = (e as { code?: string }).code ?? "upstream_error";
    if (GONE.has(code)) {
      declined = true;
      return null;
    }
    if (code !== "invalid_json") throw new ApiError(502, friendly(code));
    rawText = (e as { text?: string }).text ?? "";
  }
  if (raw !== undefined) {
    try {
      return check(raw);
    } catch (err) {
      rawText = JSON.stringify(raw);
      problem = (err as Error).message;
    }
  }
  const repair =
    `${prompt}\n\nYour previous answer was:\n${rawText.slice(0, 20000) || "(not valid JSON)"}\n\n` +
    `It failed validation: ${problem}.\n` +
    "Return the corrected JSON object only, fixing every problem. Keep the content that was valid.";
  try {
    return check(await s.json(repair, { modelTier: "default", cache: false }));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code && GONE.has(code)) {
      declined = true;
      return null;
    }
    if (code && code !== "invalid_json") throw new ApiError(502, friendly(code));
    throw new ApiError(502, "Claude returned malformed data twice. Please try again.");
  }
}

// ------------------------------------------------------------------ syllabus ---
const SYLLABUS_PROMPT = `You turn a student's raw syllabus into a clean study structure.

Reply with only this JSON object:
{"subjects": [{"name": "...", "units": [{"name": "...", "topics": [{"name": "...", "difficulty": 3, "est_minutes": 60}]}]}]}

Rules:
- Subjects are courses/papers. Units are the syllabus's own units/modules/chapters (keep their numbering in the name, e.g. "Unit 2: Normalization"). Topics are the individual teachable items inside a unit.
- Split comma- or semicolon-separated lists into separate topics. Keep topic names short (2-8 words) and specific.
- difficulty: integer 1 (trivial) to 5 (hardest in the course), for a typical undergraduate.
- est_minutes: realistic first-pass study time for an undergraduate, 15-240.
- Don't invent topics that aren't in the syllabus. Ignore admin text (credits, marks, textbooks, outcomes).
- If the text has no subject headings, make one subject named after the course or "General".`;

export async function parseSyllabus(text: string): Promise<{ subjects: ParsedSubject[]; source: "ai" | "demo" }> {
  const t = text.trim();
  if (t.length < 10) throw new ApiError(422, "The syllabus is empty. Paste some text first.");
  if (t.length > 60_000) throw new ApiError(422, `The syllabus is too long (${t.length.toLocaleString()} characters). Paste one subject at a time.`);
  const live = await askJson(`${SYLLABUS_PROMPT}\n\n<syllabus>\n${t}\n</syllabus>`, validate.syllabus);
  if (live) return { subjects: live, source: "ai" };
  try {
    return { subjects: mock.parseSyllabus(t), source: "demo" };
  } catch {
    throw new ApiError(422, "Couldn't find any topics in that text.");
  }
}

// ---------------------------------------------------------------------- quiz ---
export async function generateQuiz(subject: string, unit: string, topic: string, attempt: number) {
  const prompt = `You write exam-style multiple-choice quizzes for university students.

Subject: ${subject}
Unit: ${unit}
Topic: ${topic}
${attempt ? `This is retake #${attempt}: write different questions from a typical first quiz.\n` : ""}
Write exactly 10 questions on this topic, accurate to standard university textbooks:
- 4 "easy" (definitions, recognition), 4 "medium" (application, comparing concepts), 2 "hard" (multi-step reasoning, edge cases, tricky exam-style).
- Each has exactly 4 options, exactly one correct. Distractors must be plausible mistakes a student would make. No "all/none of the above".
- Vary the position of the correct answer.
- "explanation": 1-3 sentences saying why the answer is right AND why the most tempting wrong option is wrong.

Reply with only this JSON object:
{"questions": [{"difficulty": "easy", "question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0, "explanation": "..."}]}`;
  const live = await askJson(prompt, validate.quiz);
  return live ?? mock.generateQuiz(subject, unit, topic, attempt);
}

// -------------------------------------------------------------------- review ---
export async function generateReview(stats: WeeklyStats) {
  const prompt = `You are a blunt, no-nonsense study coach writing a student's weekly review from their real stats.

Rules:
- Be direct. No praise padding, no "great job", no emojis, no motivational filler. If the week was bad, say so.
- Every finding must quote specific numbers from the stats (sessions skipped of planned, quiz %, topic names, days left). Never invent numbers or topics.
- Lead with the most damaging problem. Example tone: "You skipped 3 of 5 DBMS days and scored 40% on joins. Fix this first."
- If the week was genuinely good, say so in one sentence, then point at the next weakest spot.
- With little data (new plan), say what's missing rather than inventing problems.

<stats>
${JSON.stringify(stats)}
</stats>

Reply with only this JSON object:
{"verdict": "one or two sentences, max 300 characters", "findings": ["2-5 short sentences, worst first"], "actions": ["exactly 3 concrete, checkable actions for the next 7 days, each naming a subject/topic and a number"]}`;
  const live = await askJson(prompt, validate.review);
  return live ?? mock.generateReview(stats);
}
