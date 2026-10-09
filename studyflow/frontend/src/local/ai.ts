/**
 * AI features for the in-page backend. Same contract as the server
 * (backend/app/services/ai): ask for JSON, validate it, and on failure ask once
 * more with the exact validation error. With no engine (no key, or Claude not
 * allowed here), fall back to the offline demo logic.
 */
import type { ParsedSubject } from "../lib/api";
import { ApiError } from "../lib/errors";
import { EngineError, getEngine, type AskOpts } from "./engine";
import * as mock from "./mock";
import type { WeeklyStats } from "./stats";
import * as validate from "./validate";

/** Codes meaning "Claude isn't usable in this view": switch to demo mode for this visit. */
const GONE = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"]);
let declined = false;

export async function aiMode(): Promise<"live" | "demo"> {
  return !declined && (await getEngine()) ? "live" : "demo";
}

function friendly(code: string, detail = ""): string {
  switch (code) {
    case "bad_key": return "Your Claude API key was rejected. Check it in Settings.";
    case "no_access": return "Your API key can't use this model. Pick another model in Settings.";
    case "bad_model": return "That model isn't available to your API key. Pick another model in Settings.";
    case "rate_limited": return "Claude is rate-limiting you right now. Wait a minute and try again.";
    case "offline": return "You're offline. AI features need internet; everything else still works.";
    case "session_expired": return "Your Claude session expired. Reload the page and sign in again.";
    case "refused": return "Claude declined this request. Try rephrasing it.";
    case "too_long":
    case "prompt_too_large": return "That was too long for one request. Try a shorter syllabus or one subject at a time.";
    case "bad_request": return `Claude rejected the request: ${detail}`;
    default: return "Couldn't reach Claude just now. Try again.";
  }
}

const FENCE = /```(?:json)?\s*([\s\S]*?)```/g;
function extractJson(text: string): unknown {
  const t = text.trim();
  const candidates = [t, ...[...t.matchAll(FENCE)].map((m) => m[1])];
  if (t.includes("{") && t.includes("}")) candidates.push(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch { /* try the next candidate */ }
  }
  throw new validate.ValidationError("the reply did not contain a valid JSON object");
}

interface Answer<T> { value: T; sources: { url: string; title: string }[] }

/** Ask, validate, repair once. Resolves null when no engine is available (→ demo). */
async function askJson<T>(prompt: string, check: (raw: unknown) => T, opts: AskOpts): Promise<Answer<T> | null> {
  const engine = declined ? null : await getEngine();
  if (!engine) return null;

  let rawText = "";
  let problem = "the reply was not a single valid JSON object";
  let sources: Answer<T>["sources"] = [];
  try {
    const r = await engine.ask(prompt, opts);
    sources = r.sources;
    rawText = r.text;
    try {
      return { value: check(r.raw !== undefined ? r.raw : extractJson(r.text)), sources };
    } catch (err) {
      problem = (err as Error).message;
    }
  } catch (e) {
    if (classify(e) === "gone") return null;
    rawText = (e as EngineError).message; // invalid_json: the raw reply
  }

  // Repair round: no tools, schema enforced, show Claude its own mistake.
  const repair =
    `${prompt}\n\nYour previous answer was:\n${rawText.slice(0, 20000) || "(not valid JSON)"}\n\n` +
    `It failed validation: ${problem}.\nReturn the corrected JSON object only, fixing every problem. Keep the content that was valid.`;
  try {
    const r = await engine.ask(repair, { schema: opts.schema, effort: opts.effort });
    return { value: check(r.raw !== undefined ? r.raw : extractJson(r.text)), sources };
  } catch (e) {
    if (e instanceof EngineError && classify(e) === "gone") return null;
    throw new ApiError(502, "Claude returned malformed data twice. Please try again.");
  }
}

/** "gone" = Claude can't be used in this view (switch to demo); "invalid_json" = repairable; anything else throws a user-facing error. */
function classify(e: unknown): "gone" | "invalid_json" {
  if (!(e instanceof EngineError)) throw e;
  if (GONE.has(e.code)) {
    declined = true;
    return "gone";
  }
  if (e.code === "invalid_json") return "invalid_json";
  throw new ApiError(502, friendly(e.code, e.message));
}

// ---------------------------------------------------------------- schemas ---
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items: unknown) => ({ type: "array", items });
const str = { type: "string" };
const SYLLABUS_SCHEMA = obj({
  subjects: arr(obj({ name: str, units: arr(obj({ name: str, topics: arr(obj({ name: str, difficulty: { type: "integer" }, est_minutes: { type: "integer" } })) })) })),
});
const QUIZ_SCHEMA = obj({
  questions: arr(obj({ difficulty: { type: "string", enum: ["easy", "medium", "hard"] }, question: str, options: arr(str), correct_index: { type: "integer" }, explanation: str })),
});
const REVIEW_SCHEMA = obj({ verdict: str, findings: arr(str), actions: arr(str) });

// --------------------------------------------------------------- syllabus ---
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
  const live = await askJson(`${SYLLABUS_PROMPT}\n\n<syllabus>\n${t}\n</syllabus>`, validate.syllabus, { schema: SYLLABUS_SCHEMA, effort: "low" });
  if (live) return { subjects: live.value, source: "ai" };
  try {
    return { subjects: mock.parseSyllabus(t), source: "demo" };
  } catch {
    throw new ApiError(422, "Couldn't find any topics in that text.");
  }
}

export async function canReadPdf(): Promise<boolean> {
  return !declined && !!(await getEngine())?.canReadPdf;
}

export async function parseSyllabusPdf(pdfBase64: string) {
  const live = await askJson(`${SYLLABUS_PROMPT}\n\nThe attached PDF is the syllabus. Return the JSON structure.`, validate.syllabus, {
    schema: SYLLABUS_SCHEMA, effort: "low", pdfBase64,
  });
  if (!live) throw new ApiError(422, "Reading PDFs needs your Claude API key (Settings). Or copy the text from the PDF and paste it.");
  return { subjects: live.value, source: "ai" as const };
}

// ------------------------------------------------------------------- quiz ---
export async function generateQuiz(subject: string, unit: string, topic: string, attempt: number) {
  const engine = declined ? null : await getEngine();
  const research = engine?.canSearch
    ? "Use web search to check facts, definitions and current conventions first (prefer textbooks, university course pages, official docs)."
    : "Keep every fact accurate to standard university textbooks.";
  const prompt = `You write exam-style multiple-choice quizzes for university students.

Subject: ${subject}
Unit: ${unit}
Topic: ${topic}
${attempt ? `This is retake #${attempt}: write different questions from a typical first quiz.\n` : ""}
${research} Then write exactly 10 questions:
- 4 "easy" (definitions, recognition), 4 "medium" (application, comparing concepts), 2 "hard" (multi-step reasoning, edge cases, tricky exam-style).
- Each has exactly 4 options, exactly one correct. Distractors must be plausible mistakes a student would make. No "all/none of the above".
- Vary the position of the correct answer. Questions must be self-contained.
- "explanation": 1-3 sentences saying why the answer is right AND why the most tempting wrong option is wrong.

Your final message must be ONLY this JSON object:
{"questions": [{"difficulty": "easy", "question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0, "explanation": "..."}]}`;
  const live = await askJson(prompt, validate.quiz, { schema: QUIZ_SCHEMA, webSearch: engine?.canSearch, effort: "medium" });
  return live ? { questions: live.value, sources: live.sources } : { questions: mock.generateQuiz(subject, unit, topic, attempt), sources: [] };
}

// ----------------------------------------------------------------- review ---
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
  const live = await askJson(prompt, validate.review, { schema: REVIEW_SCHEMA, effort: "medium" });
  return live ? live.value : mock.generateReview(stats);
}
