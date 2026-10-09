"""Offline stand-ins for the AI features.

Used when no ANTHROPIC_API_KEY is configured (or AI_MOCK=true). They're deterministic,
so tests are stable, and good enough that the whole app is usable without paying for
API calls. The syllabus parser is a real heuristic parser, not canned data.
"""

from __future__ import annotations

import hashlib
import random
import re

from .schemas import ParsedSyllabus, QuizOut, ReviewOut

_SUBJECT_RE = re.compile(r"^\s*(?:#+\s*|(?:subject|course|paper)\s*[:\-–]\s*)(?P<name>.+)$", re.I)
_UNIT_RE = re.compile(
    r"^\s*(?:#{2,}\s*)?(?P<label>(?:unit|module|chapter|part|section)\s*[-–:]?\s*[0-9ivxlc]+\b)\s*[:.\-–)]?\s*(?P<rest>.*)$",
    re.I,
)
_BULLET_RE = re.compile(r"^\s*(?:[-*•▪◦·]|\d+[.)]|[a-z][.)])\s+(?P<text>.+)$", re.I)
_HARD_WORDS = ("advanced", "proof", "theorem", "optimi", "dynamic programming", "normali", "transaction",
               "concurren", "complexity", "integral", "differential", "graph", "recursion", "kernel")
_EASY_WORDS = ("introduction", "intro", "basics", "overview", "definition", "history", "fundamental")


def _difficulty(name: str) -> int:
    n = name.lower()
    if any(w in n for w in _HARD_WORDS):
        return 4
    if any(w in n for w in _EASY_WORDS):
        return 2
    return 3


def _split_topics(text: str) -> list[str]:
    parts = re.split(r"[;,]|\s+[-–]\s+", text)
    return [p.strip(" .:") for p in parts if len(p.strip(" .:")) >= 2]


def _is_heading(line: str) -> bool:
    s = line.strip()
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and len(s) <= 60 and s.upper() == s and len(letters) >= 3


def parse_syllabus(text: str) -> ParsedSyllabus:
    subjects: list[dict] = []
    subject: dict | None = None
    unit: dict | None = None

    def ensure_subject(name="General"):
        nonlocal subject
        if subject is None:
            subject = {"name": name, "units": []}
            subjects.append(subject)
        return subject

    def ensure_unit(name="Core topics"):
        nonlocal unit
        if unit is None:
            unit = {"name": name, "topics": []}
            ensure_subject()["units"].append(unit)
        return unit

    def add_topics(names):
        u = ensure_unit()
        for n in names:
            u["topics"].append({"name": n[:300], "difficulty": _difficulty(n), "est_minutes": 45 + 15 * (_difficulty(n) - 2)})

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for idx, line in enumerate(lines):
        next_is_bullet = idx + 1 < len(lines) and bool(_BULLET_RE.match(lines[idx + 1]))
        if m := _UNIT_RE.match(line):
            rest = m.group("rest").strip()
            label = m.group("label").title()
            # "Unit 2: Normalization - 1NF, 2NF, 3NF" -> unit name + topics
            parts = re.split(r":| - |–", rest, maxsplit=1)
            head = parts[0].strip()
            unit = {"name": f"{label}: {head}" if head else label, "topics": []}
            ensure_subject()["units"].append(unit)
            if len(parts) == 2:
                add_topics(_split_topics(parts[1]))
            elif "," in head:
                unit["name"] = label
                add_topics(_split_topics(head))
            continue
        if (m := _SUBJECT_RE.match(line)) or _is_heading(line):
            name = m.group("name").strip(" :#") if m else line.strip(" :#").title()
            subject = {"name": name[:200], "units": []}
            subjects.append(subject)
            unit = None
            continue
        if m := _BULLET_RE.match(line):
            add_topics(_split_topics(m.group("text")) or [m.group("text")])
            continue
        if subject is None and next_is_bullet and len(line) < 80:
            subject = {"name": line.rstrip(":"), "units": []}
            subjects.append(subject)
            unit = None
            continue
        if (line.endswith(":") or next_is_bullet) and len(line) < 80 and "," not in line:
            unit = {"name": line.rstrip(":"), "topics": []}
            ensure_subject()["units"].append(unit)
            continue
        add_topics(_split_topics(line) if "," in line or ";" in line else [line])

    # Drop empty units/subjects, then validate exactly like an AI response.
    for s in subjects:
        s["units"] = [u for u in s["units"] if u["topics"]]
    subjects = [s for s in subjects if s["units"]]
    return ParsedSyllabus.model_validate({"subjects": subjects})


def _rng(seed: str) -> random.Random:
    return random.Random(int(hashlib.sha1(seed.encode()).hexdigest()[:8], 16))


def generate_quiz(subject: str, unit: str, topic: str, attempt: int = 0) -> QuizOut:
    rng = _rng(f"{subject}|{topic}|{attempt}")
    templates = {
        "easy": [
            ("Which of these best describes the core idea of {t}?",
             ["The central concept {t} is built on", "An unrelated topic from another subject", "A historical footnote with no practical use", "A synonym for the unit title"],
             "The definition is the foundation - if you can't state it in one line, re-read your notes on {t}."),
            ("In {s}, {t} is mainly studied in which unit?", ["{u}", "None - it's optional", "Only in lab work", "It isn't part of {s}"],
             "{t} sits in '{u}', so revise it with the rest of that unit."),
            ("What is the first thing to check when solving a basic {t} problem?",
             ["Which definitions and givens apply", "The answer key", "The longest formula you know", "Nothing - guess first"],
             "Basic problems on {t} are mostly about matching the givens to the right definition."),
            ("Which study method works best for remembering {t}?",
             ["Active recall with spaced repetition", "Re-reading once the night before", "Highlighting everything", "Watching videos at 2x without notes"],
             "Testing yourself (like this quiz) beats re-reading for long-term retention."),
        ],
        "medium": [
            ("A classmate confuses {t} with a related idea. What is the clearest way to tell them apart?",
             ["Compare their definitions on a concrete example", "Memorise both names", "Assume they're the same", "Skip it - it won't be asked"],
             "Working one concrete example through both ideas exposes the difference fast."),
            ("Which mistake is most common in exam answers on {t}?",
             ["Stating the idea without applying it to the question", "Writing too neatly", "Using correct terminology", "Drawing a labelled diagram"],
             "Examiners reward application. Always connect {t} back to the specific question."),
            ("When does applying {t} NOT give the expected result?",
             ["When its assumptions or preconditions don't hold", "Never - it always works", "Only on Tuesdays", "When the question is short"],
             "Every technique in {u} has preconditions; knowing them is what medium questions test."),
            ("How does {t} connect to other topics in {u}?",
             ["It builds on earlier topics and is used by later ones", "It is completely isolated", "It replaces the whole unit", "It only matters for practicals"],
             "Topics in a unit form a chain - map where {t} sits in it."),
        ],
        "hard": [
            ("You're given an unfamiliar exam problem that seems to involve {t}. What's the strongest first move?",
             ["Identify which property of {t} the problem is really testing", "Write everything you know about {s}", "Leave it blank", "Pick the formula with the most symbols"],
             "Hard questions disguise a standard idea. Find the property being tested, then apply it."),
            ("Which statement about the limits of {t} is most accurate?",
             ["It trades off one property for another, and you must justify the choice", "It has no limitations", "It is obsolete", "Its limits are irrelevant for exams"],
             "Discussing trade-offs is what separates top answers on {t}."),
        ],
    }
    fmt = dict(t=topic, s=subject, u=unit)
    questions = []
    for diff, n in (("easy", 4), ("medium", 4), ("hard", 2)):
        for stem, opts, expl in templates[diff][:n]:
            options = [o.format(**fmt) for o in opts]
            correct = options[0]
            rng.shuffle(options)
            questions.append({
                "difficulty": diff,
                "question": stem.format(**fmt),
                "options": options,
                "correct_index": options.index(correct),
                "explanation": "[Demo question - add an API key for real content] " + expl.format(**fmt),
            })
    return QuizOut.model_validate({"questions": questions})


def generate_review(stats: dict) -> ReviewOut:
    """Rule-based blunt review built from the same stats the AI would see."""
    findings: list[str] = []
    actions: list[str] = []
    week = stats["week"]
    planned, done = week["sessions_planned"], week["sessions_done"]
    rate = round(100 * done / planned) if planned else 0

    worst_subject = max(stats["subjects"], key=lambda s: s["missed"], default=None)
    if worst_subject and worst_subject["missed"]:
        findings.append(
            f"You skipped {worst_subject['missed']} of {worst_subject['planned']} {worst_subject['name']} sessions this week."
        )
        actions.append(f"Do your next {worst_subject['name']} session first thing tomorrow, before anything else.")
    weak = [t for t in stats["weak_topics"] if t.get("accuracy") is not None]
    if weak:
        w = weak[0]
        findings.append(f"You scored {w['accuracy']}% on {w['topic']} ({w['subject']}). That's not exam-ready.")
        actions.append(f"Re-learn {w['topic']} from scratch, then retake its quiz until you clear 70%.")
    if stats["overall"]["streak"] == 0:
        findings.append("Your streak is 0. You didn't study at all yesterday or today.")
    pace = stats["overall"]
    if pace["required_daily_minutes"] and pace["required_daily_minutes"] > pace["daily_minutes"]:
        findings.append(
            f"At {pace['daily_minutes']} min/day you can't finish; the syllabus needs {pace['required_daily_minutes']} min/day."
        )
        actions.append(f"Raise your daily study time to {pace['required_daily_minutes']} minutes or cut low-value topics now.")
    findings.append(
        f"You completed {done} of {planned} planned sessions ({rate}%) and the syllabus is {pace['completion_pct']}% done "
        f"with {pace['days_left']} days left."
    )
    defaults = [
        "Take a quiz on every topic you finished this week - untested topics don't count as learned.",
        "Use your next buffer day to clear missed sessions, not to rest.",
        "Put your phone in another room for the first 45 minutes of every session.",
    ]
    for d in defaults:
        if len(actions) >= 3:
            break
        actions.append(d)

    if planned == 0:
        verdict = "No sessions were planned this week, so there is nothing to judge yet. Start today."
    elif rate >= 85 and not weak:
        verdict = f"Solid week: {rate}% of sessions done. Don't get comfortable - keep the pace."
    elif rate >= 85:
        verdict = (f"You showed up ({rate}% of sessions done), but your quiz scores say it isn't sticking. "
                   "Sitting through sessions is not the same as learning.")
    elif rate >= 60:
        verdict = f"Average week. {rate}% done is how people end up cramming the night before."
    else:
        verdict = f"Bad week. You did {rate}% of what you planned. At this rate you will not finish the syllabus."
    return ReviewOut.model_validate({"verdict": verdict, "findings": findings[:6] if len(findings) >= 2 else findings + ["Not enough quiz data yet - take quizzes so weak spots show up."], "actions": actions[:3]})
