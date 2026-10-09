/**
 * Offline stand-ins, ported from backend/app/services/ai/mock.py: a real heuristic
 * syllabus parser, template quizzes and a rule-based blunt review. Used when this
 * view can't ask Claude (or the viewer declined).
 */
import type { ParsedSubject } from "../lib/api";
import type { WeeklyStats } from "./stats";
import * as validate from "./validate";

const SUBJECT_RE = /^\s*(?:#+\s*|(?:subject|course|paper)\s*[:\-–]\s*)(.+)$/i;
const UNIT_RE = /^\s*(?:#{2,}\s*)?((?:unit|module|chapter|part|section)\s*[-–:]?\s*[0-9ivxlc]+\b)\s*[:.\-–)]?\s*(.*)$/i;
const BULLET_RE = /^\s*(?:[-*•▪◦·]|\d+[.)]|[a-z][.)])\s+(.+)$/i;
const HARD = ["advanced", "proof", "theorem", "optimi", "dynamic programming", "normali", "transaction", "concurren", "complexity", "integral", "differential", "graph", "recursion", "kernel"];
const EASY = ["introduction", "intro", "basics", "overview", "definition", "history", "fundamental"];

const difficulty = (name: string) => {
  const n = name.toLowerCase();
  if (HARD.some((w) => n.includes(w))) return 4;
  if (EASY.some((w) => n.includes(w))) return 2;
  return 3;
};
const splitTopics = (text: string) => text.split(/[;,]|\s+[-–]\s+/).map((p) => p.trim().replace(/^[ .:]+|[ .:]+$/g, "")).filter((p) => p.length >= 2);
const isHeading = (line: string) => {
  const s = line.trim();
  const letters = [...s].filter((c) => /\p{L}/u.test(c));
  return letters.length >= 3 && s.length <= 60 && s.toUpperCase() === s;
};
const title = (s: string) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());

type U = { name: string; topics: { name: string; difficulty: number; est_minutes: number }[] };
type S = { name: string; units: U[] };

export function parseSyllabus(text: string): ParsedSubject[] {
  const subjects: S[] = [];
  let subject: S | null = null;
  let unit: U | null = null;
  const ensureSubject = () => {
    if (!subject) {
      subject = { name: "General", units: [] };
      subjects.push(subject);
    }
    return subject;
  };
  const ensureUnit = () => {
    if (!unit) {
      unit = { name: "Core topics", topics: [] };
      ensureSubject().units.push(unit);
    }
    return unit;
  };
  const addTopics = (names: string[]) => {
    const u = ensureUnit();
    for (const n of names) u.topics.push({ name: n.slice(0, 300), difficulty: difficulty(n), est_minutes: 45 + 15 * (difficulty(n) - 2) });
  };

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, idx) => {
    const nextIsBullet = idx + 1 < lines.length && BULLET_RE.test(lines[idx + 1]);
    let m: RegExpMatchArray | null;
    if ((m = line.match(UNIT_RE))) {
      const label = title(m[1]);
      const parts = m[2].trim().split(/:| - |–/);
      const head = parts[0].trim();
      const tail = parts.length > 1 ? parts.slice(1).join(" ") : null;
      unit = { name: head ? `${label}: ${head}` : label, topics: [] };
      ensureSubject().units.push(unit);
      if (tail !== null) addTopics(splitTopics(tail));
      else if (head.includes(",")) {
        unit.name = label;
        addTopics(splitTopics(head));
      }
      return;
    }
    const sm = line.match(SUBJECT_RE);
    if (sm || isHeading(line)) {
      const name = sm ? sm[1].replace(/^[ :#]+|[ :#]+$/g, "") : title(line.replace(/^[ :#]+|[ :#]+$/g, ""));
      subject = { name: name.slice(0, 200), units: [] };
      subjects.push(subject);
      unit = null;
      return;
    }
    if ((m = line.match(BULLET_RE))) {
      const t = splitTopics(m[1]);
      addTopics(t.length ? t : [m[1]]);
      return;
    }
    if (subject === null && nextIsBullet && line.length < 80) {
      subject = { name: line.replace(/:$/, ""), units: [] };
      subjects.push(subject);
      unit = null;
      return;
    }
    if ((line.endsWith(":") || nextIsBullet) && line.length < 80 && !line.includes(",")) {
      unit = { name: line.replace(/:$/, ""), topics: [] };
      ensureSubject().units.push(unit);
      return;
    }
    addTopics(line.includes(",") || line.includes(";") ? splitTopics(line) : [line]);
  });
  return validate.syllabus({ subjects });
}

// Deterministic shuffle so the demo quiz is stable for a topic.
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const TEMPLATES: Record<"easy" | "medium" | "hard", [string, string[], string][]> = {
  easy: [
    ["Which of these best describes the core idea of {t}?", ["The central concept {t} is built on", "An unrelated topic from another subject", "A historical footnote with no practical use", "A synonym for the unit title"], "The definition is the foundation. If you can't state it in one line, re-read your notes on {t}."],
    ["In {s}, {t} is mainly studied in which unit?", ["{u}", "None, it's optional", "Only in lab work", "It isn't part of {s}"], "{t} sits in '{u}', so revise it with the rest of that unit."],
    ["What is the first thing to check when solving a basic {t} problem?", ["Which definitions and givens apply", "The answer key", "The longest formula you know", "Nothing, guess first"], "Basic problems on {t} are mostly about matching the givens to the right definition."],
    ["Which study method works best for remembering {t}?", ["Active recall with spaced repetition", "Re-reading once the night before", "Highlighting everything", "Watching videos at 2x without notes"], "Testing yourself (like this quiz) beats re-reading for long-term retention."],
  ],
  medium: [
    ["A classmate confuses {t} with a related idea. What is the clearest way to tell them apart?", ["Compare their definitions on a concrete example", "Memorise both names", "Assume they're the same", "Skip it, it won't be asked"], "Working one concrete example through both ideas exposes the difference fast."],
    ["Which mistake is most common in exam answers on {t}?", ["Stating the idea without applying it to the question", "Writing too neatly", "Using correct terminology", "Drawing a labelled diagram"], "Examiners reward application. Always connect {t} back to the specific question."],
    ["When does applying {t} NOT give the expected result?", ["When its assumptions or preconditions don't hold", "Never, it always works", "Only on Tuesdays", "When the question is short"], "Every technique in {u} has preconditions; knowing them is what medium questions test."],
    ["How does {t} connect to other topics in {u}?", ["It builds on earlier topics and is used by later ones", "It is completely isolated", "It replaces the whole unit", "It only matters for practicals"], "Topics in a unit form a chain. Map where {t} sits in it."],
  ],
  hard: [
    ["You're given an unfamiliar exam problem that seems to involve {t}. What's the strongest first move?", ["Identify which property of {t} the problem is really testing", "Write everything you know about {s}", "Leave it blank", "Pick the formula with the most symbols"], "Hard questions disguise a standard idea. Find the property being tested, then apply it."],
    ["Which statement about the limits of {t} is most accurate?", ["It trades off one property for another, and you must justify the choice", "It has no limitations", "It is obsolete", "Its limits are irrelevant for exams"], "Discussing trade-offs is what separates top answers on {t}."],
  ],
};

export function generateQuiz(subject: string, unit: string, topic: string, attempt = 0) {
  const r = rng(`${subject}|${topic}|${attempt}`);
  const fill = (x: string) => x.replaceAll("{t}", topic).replaceAll("{s}", subject).replaceAll("{u}", unit);
  const questions = (["easy", "medium", "hard"] as const).flatMap((diff) =>
    TEMPLATES[diff].map(([stem, opts, expl]) => {
      const options = opts.map(fill);
      const correct = options[0];
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      return { difficulty: diff, question: fill(stem), options, correct_index: options.indexOf(correct), explanation: "[Demo question] " + fill(expl) };
    }),
  );
  return validate.quiz({ questions });
}

export function generateReview(stats: WeeklyStats): validate.ReviewOut {
  const findings: string[] = [];
  const actions: string[] = [];
  const { sessions_planned: planned, sessions_done: done } = stats.week;
  const rate = planned ? Math.round((100 * done) / planned) : 0;

  const worst = [...stats.subjects].sort((a, b) => b.missed - a.missed)[0];
  if (worst?.missed) {
    findings.push(`You skipped ${worst.missed} of ${worst.planned} ${worst.name} sessions this week.`);
    actions.push(`Do your next ${worst.name} session first thing tomorrow, before anything else.`);
  }
  const weak = stats.weak_topics.filter((t) => t.accuracy !== null);
  if (weak.length) {
    const w = weak[0];
    findings.push(`You scored ${w.accuracy}% on ${w.topic} (${w.subject}). That's not exam-ready.`);
    actions.push(`Re-learn ${w.topic} from scratch, then retake its quiz until you clear 70%.`);
  }
  const o = stats.overall;
  if (o.streak === 0) findings.push("Your streak is 0. You didn't study at all yesterday or today.");
  if (o.required_daily_minutes && o.required_daily_minutes > o.daily_minutes) {
    findings.push(`At ${o.daily_minutes} min/day you can't finish; the syllabus needs ${o.required_daily_minutes} min/day.`);
    actions.push(`Raise your daily study time to ${o.required_daily_minutes} minutes or cut low-value topics now.`);
  }
  findings.push(`You completed ${done} of ${planned} planned sessions (${rate}%) and the syllabus is ${o.completion_pct}% done with ${o.days_left} days left.`);
  for (const d of [
    "Take a quiz on every topic you finished this week. Untested topics don't count as learned.",
    "Use your next buffer day to clear missed sessions, not to rest.",
    "Put your phone in another room for the first 45 minutes of every session.",
  ]) if (actions.length < 3) actions.push(d);

  let verdict: string;
  if (planned === 0) verdict = "No sessions were planned this week, so there is nothing to judge yet. Start today.";
  else if (rate >= 85 && !weak.length) verdict = `Solid week: ${rate}% of sessions done. Don't get comfortable. Keep the pace.`;
  else if (rate >= 85) verdict = `You showed up (${rate}% of sessions done), but your quiz scores say it isn't sticking. Sitting through sessions is not the same as learning.`;
  else if (rate >= 60) verdict = `Average week. ${rate}% done is how people end up cramming the night before.`;
  else verdict = `Bad week. You did ${rate}% of what you planned. At this rate you will not finish the syllabus.`;
  if (findings.length < 2) findings.push("Not enough quiz data yet. Take quizzes so weak spots show up.");
  return validate.review({ verdict, findings: findings.slice(0, 6), actions: actions.slice(0, 3) });
}
