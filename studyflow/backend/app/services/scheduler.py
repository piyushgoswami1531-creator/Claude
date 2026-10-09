"""Deterministic study scheduler.

Pure functions only: no DB, no AI. Input is a list of topics with how many minutes
they still need; output is a list of day-by-day items. Being pure makes it trivially
unit-testable and lets the re-planner call it again whenever a day is missed.

Algorithm
---------
1. Calendar: every day from `start` up to (not including) the exam.
   - The last ~10% of days (min 1, only if >= 3 days) are final-revision days.
   - Every 7th remaining day is a buffer day (catch-up slack).
   - The rest are study days.
2. Revisions (spaced repetition): when a topic's last learning chunk lands on day D,
   short revise sessions are queued for D+1, D+3 and D+7 (snapped forward to the next
   study day, dropped if that falls on/after the exam).
3. Packing: each study day fills due revisions first, then new material. New topics are
   interleaved round-robin across subjects (weak subjects first) so the student never
   gets a week of a single subject. Long topics are split across days.
4. Overload: if the work doesn't fit, every topic is scaled down proportionally and the
   result reports the daily minutes that would actually be required.
"""

from __future__ import annotations

import math
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import date, timedelta

STRENGTH_FACTOR = {"weak": 1.4, "neutral": 1.0, "strong": 0.75}
STRENGTH_RANK = {"weak": 0, "neutral": 1, "strong": 2}
REVISION_INTERVALS = (1, 3, 7)
MIN_CHUNK = 15  # never schedule a learning chunk shorter than this (unless it finishes a topic)
BUFFER_EVERY = 7


def difficulty_factor(difficulty: int) -> float:
    # 1 -> 0.8x, 3 -> 1.0x, 5 -> 1.4x
    return {1: 0.8, 2: 0.9, 3: 1.0, 4: 1.2, 5: 1.4}.get(int(difficulty), 1.0)


def weighted_minutes(est_minutes: int, difficulty: int, strength: str) -> int:
    return max(MIN_CHUNK, round(est_minutes * difficulty_factor(difficulty) * STRENGTH_FACTOR.get(strength, 1.0)))


def revision_minutes(topic_minutes: int) -> int:
    return int(min(25, max(10, round(topic_minutes * 0.2))))


@dataclass(frozen=True)
class TopicIn:
    id: int
    subject_id: int
    strength: str  # weak | neutral | strong
    minutes: int  # minutes still needed (already weighted)
    difficulty: int = 3
    order: int = 0  # position within the syllabus (unit order, then topic order)
    full_minutes: int | None = None  # total weighted minutes, used to size revisions


@dataclass(frozen=True)
class SeedRevision:
    """A revision owed for a topic finished before this (re)plan started."""

    due: date
    topic_id: int
    minutes: int
    interval: int


@dataclass
class PlannedItem:
    date: date
    kind: str  # learn | revise | buffer | final_revision
    minutes: int
    topic_id: int | None = None
    rev_interval: int | None = None


@dataclass
class ScheduleResult:
    items: list[PlannedItem] = field(default_factory=list)
    overloaded: bool = False
    required_daily_minutes: int | None = None
    study_days: int = 0
    buffer_days: int = 0
    final_days: int = 0


def split_days(start: date, exam: date) -> tuple[list[date], list[date], list[date]]:
    """Return (study_days, buffer_days, final_days) for [start, exam)."""
    n = (exam - start).days
    if n <= 0:
        return [], [], []
    days = [start + timedelta(days=i) for i in range(n)]
    final_count = max(1, round(n * 0.1)) if n >= 3 else 0
    final = days[n - final_count:] if final_count else []
    rest = days[: n - final_count]
    buffers, study = [], []
    for i, d in enumerate(rest):
        if len(rest) >= BUFFER_EVERY and (i + 1) % BUFFER_EVERY == 0:
            buffers.append(d)
        else:
            study.append(d)
    return study, buffers, final


def interleave(topics: list[TopicIn]) -> list[TopicIn]:
    """Round-robin across subjects; weak subjects lead each round."""
    by_subject: dict[int, deque[TopicIn]] = defaultdict(deque)
    strength_of: dict[int, str] = {}
    first_order: dict[int, int] = {}
    for t in sorted(topics, key=lambda t: t.order):
        by_subject[t.subject_id].append(t)
        strength_of[t.subject_id] = t.strength
        first_order.setdefault(t.subject_id, t.order)
    subject_order = sorted(by_subject, key=lambda s: (STRENGTH_RANK.get(strength_of[s], 1), first_order[s]))
    out: list[TopicIn] = []
    while any(by_subject[s] for s in subject_order):
        for s in subject_order:
            if by_subject[s]:
                out.append(by_subject[s].popleft())
    return out


def build_schedule(
    topics: list[TopicIn],
    start: date,
    exam: date,
    daily_minutes: int,
    seed_revisions: list[SeedRevision] | None = None,
    used_today: int = 0,
) -> ScheduleResult:
    """Build the plan from `start` (inclusive) to `exam` (exclusive).

    `used_today` is the minutes the student already completed on `start`; it is
    subtracted from that day's capacity so a mid-day re-plan doesn't overbook today.
    """
    daily_minutes = max(15, int(daily_minutes))
    study, buffers, final = split_days(start, exam)
    result = ScheduleResult(study_days=len(study), buffer_days=len(buffers), final_days=len(final))
    if not (study or buffers or final):
        result.overloaded = bool(topics)
        return result
    if not study:
        # Very short runway: everything becomes study time.
        study, buffers, final = sorted(study + buffers + final), [], []
        result.study_days, result.buffer_days, result.final_days = len(study), 0, 0

    pending = [t for t in topics if t.minutes > 0]
    full = {t.id: (t.full_minutes or t.minutes) for t in pending}

    # --- capacity check & proportional squeeze -------------------------------------
    capacity = len(study) * daily_minutes - min(used_today, daily_minutes)
    learn_demand = sum(t.minutes for t in pending)
    rev_demand = sum(revision_minutes(full[t.id]) * len(REVISION_INTERVALS) for t in pending)
    rev_demand += sum(s.minutes for s in seed_revisions or [])
    demand = learn_demand + rev_demand
    scale = 1.0
    if demand > capacity and demand > 0:
        result.overloaded = True
        result.required_daily_minutes = math.ceil((demand + min(used_today, daily_minutes)) / len(study))
        scale = max(capacity, 0) / demand

    def scaled(m: int) -> int:
        return max(MIN_CHUNK if m >= MIN_CHUNK else m, round(m * scale)) if scale < 1 else m

    remaining = {t.id: scaled(t.minutes) for t in pending}
    queue = deque(interleave(pending))

    study_set = sorted(study)

    def snap(d: date) -> date | None:
        for s in study_set:
            if s >= d:
                return s
        return None

    revisions_due: dict[date, list[PlannedItem]] = defaultdict(list)

    def queue_revision(due: date, topic_id: int, minutes: int, interval: int) -> None:
        day = snap(due)
        if day is not None:
            revisions_due[day].append(
                PlannedItem(date=day, kind="revise", minutes=minutes, topic_id=topic_id, rev_interval=interval)
            )

    def rev_mins(m: int) -> int:
        return m if scale >= 1 else max(10, round(m * scale))

    for s in seed_revisions or []:
        queue_revision(max(s.due, start), s.topic_id, rev_mins(s.minutes), s.interval)

    carry: list[PlannedItem] = []
    for day in study_set:
        cap = daily_minutes - (min(used_today, daily_minutes) if day == start else 0)

        # 1) revisions first (including ones that didn't fit yesterday)
        todays_revs = carry + revisions_due.pop(day, [])
        carry = []
        for rev in todays_revs:
            if cap >= rev.minutes or cap >= 10:
                rev.date = day
                rev.minutes = min(rev.minutes, max(cap, 10))
                result.items.append(rev)
                cap -= rev.minutes
            else:
                carry.append(rev)

        # 2) new material
        while queue and cap > 0:
            t = queue[0]
            need = remaining[t.id]
            chunk = min(need, cap)
            if chunk < need and chunk < MIN_CHUNK:
                break  # don't create a tiny fragment; continue tomorrow
            result.items.append(PlannedItem(date=day, kind="learn", minutes=chunk, topic_id=t.id))
            remaining[t.id] -= chunk
            cap -= chunk
            if remaining[t.id] <= 0:
                queue.popleft()
                for interval in REVISION_INTERVALS:
                    queue_revision(day + timedelta(days=interval), t.id, rev_mins(revision_minutes(full[t.id])), interval)

    # Anything still unplaced (rounding / tiny runway) goes onto the last study day.
    if queue and study_set:
        result.overloaded = True
        last = study_set[-1]
        for t in queue:
            if remaining[t.id] > 0:
                result.items.append(PlannedItem(date=last, kind="learn", minutes=remaining[t.id], topic_id=t.id))
        if result.required_daily_minutes is None:
            result.required_daily_minutes = math.ceil(demand / len(study_set))

    for d in buffers:
        result.items.append(PlannedItem(date=d, kind="buffer", minutes=daily_minutes))

    # Final revision: cycle all topics, weak subjects and harder topics first, 3 per day.
    if final:
        all_topics = sorted(topics, key=lambda t: (STRENGTH_RANK.get(t.strength, 1), -t.difficulty, t.order))
        if all_topics:
            per_day = min(3, len(all_topics))
            each = max(10, daily_minutes // per_day)
            k = 0
            for d in final:
                for _ in range(per_day):
                    t = all_topics[k % len(all_topics)]
                    result.items.append(PlannedItem(date=d, kind="final_revision", minutes=each, topic_id=t.id))
                    k += 1
        else:
            for d in final:
                result.items.append(PlannedItem(date=d, kind="final_revision", minutes=daily_minutes))

    result.items.sort(key=lambda i: (i.date, {"revise": 0, "learn": 1, "final_revision": 2, "buffer": 3}[i.kind]))
    return result
