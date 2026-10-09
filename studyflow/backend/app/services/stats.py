"""Every number on the dashboard (and in the weekly review) comes from here."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Plan, Question, Quiz, ScheduleItem
from .planning import iter_topics

WEAK_ACCURACY = 60
WEAK_MISSED = 2


def _pct(a: int, b: int) -> int | None:
    return round(100 * a / b) if b else None


def _quiz_results(db: Session, topic_ids: list[int]) -> dict[int, list[dict]]:
    """Submitted quiz attempts per topic, oldest first."""
    if not topic_ids:
        return {}
    quizzes = db.scalars(
        select(Quiz).where(Quiz.topic_id.in_(topic_ids), Quiz.submitted_at.is_not(None)).order_by(Quiz.submitted_at)
    ).all()
    out: dict[int, list[dict]] = defaultdict(list)
    for q in quizzes:
        out[q.topic_id].append({"id": q.id, "score": q.score, "total": q.total, "at": q.submitted_at})
    return out


def _difficulty_accuracy(db: Session, topic_ids: list[int]) -> dict[str, int | None]:
    if not topic_ids:
        return {"easy": None, "medium": None, "hard": None}
    rows = db.execute(
        select(Question.difficulty, Question.chosen_index, Question.correct_index)
        .join(Quiz)
        .where(Quiz.topic_id.in_(topic_ids), Quiz.submitted_at.is_not(None))
    ).all()
    agg = {"easy": [0, 0], "medium": [0, 0], "hard": [0, 0]}
    for d, chosen, correct in rows:
        agg[d][1] += 1
        agg[d][0] += int(chosen == correct)
    return {k: _pct(c, n) for k, (c, n) in agg.items()}


def streak(done_dates: set[date], today: date) -> int:
    """Consecutive study days ending today (or yesterday, if today isn't started yet)."""
    day = today if today in done_dates else today - timedelta(days=1)
    n = 0
    while day in done_dates:
        n += 1
        day -= timedelta(days=1)
    return n


def best_streak(done_dates: set[date]) -> int:
    best = run = 0
    prev = None
    for d in sorted(done_dates):
        run = run + 1 if prev and d - prev == timedelta(days=1) else 1
        best = max(best, run)
        prev = d
    return best


def compute(db: Session, plan: Plan, today: date) -> dict:
    items = db.scalars(select(ScheduleItem).where(ScheduleItem.plan_id == plan.id)).all()
    rows = list(iter_topics(plan))
    topic_ids = [t.id for _, _, t, _ in rows]
    quizzes = _quiz_results(db, topic_ids)

    done_dates = {i.completed_at.date() for i in items if i.status == "done" and i.completed_at and i.kind != "buffer"}

    missed_by_topic: dict[int, int] = defaultdict(int)
    for i in items:
        if i.status == "missed" and i.topic_id:
            missed_by_topic[i.topic_id] += 1

    # ---------------- per topic
    topics = []
    for s, u, t, _ in rows:
        attempts = quizzes.get(t.id, [])
        latest = attempts[-1] if attempts else None
        topics.append({
            "id": t.id, "name": t.name, "unit": u.name, "subject": s.name, "subject_id": s.id, "color": s.color,
            "status": t.status, "difficulty": t.difficulty,
            "accuracy": _pct(latest["score"], latest["total"]) if latest else None,
            "best_accuracy": max(_pct(a["score"], a["total"]) for a in attempts) if attempts else None,
            "attempts": len(attempts),
            "missed": missed_by_topic.get(t.id, 0),
        })

    weak_topics = sorted(
        [t for t in topics if (t["accuracy"] is not None and t["accuracy"] < WEAK_ACCURACY) or t["missed"] >= WEAK_MISSED],
        key=lambda t: (t["accuracy"] if t["accuracy"] is not None else 101, -t["missed"]),
    )

    # ---------------- per subject
    topic_subject = {t["id"]: t["subject_id"] for t in topics}
    subj_items: dict[int, dict[str, int]] = defaultdict(lambda: {"planned": 0, "done": 0, "missed": 0})
    for i in items:
        if i.kind == "buffer" or not i.topic_id:
            continue
        sid = topic_subject.get(i.topic_id)
        if sid is None or (i.date >= today and i.status != "done"):
            continue  # only past (or already-done) sessions count
        subj_items[sid]["planned"] += 1
        if i.status == "done":
            subj_items[sid]["done"] += 1
        elif i.status == "missed":
            subj_items[sid]["missed"] += 1

    subjects = []
    for s in plan.subjects:
        ts = [t for t in topics if t["subject_id"] == s.id]
        scored = [t["accuracy"] for t in ts if t["accuracy"] is not None]
        subjects.append({
            "id": s.id, "name": s.name, "color": s.color, "strength": s.strength,
            "topics": len(ts), "topics_done": sum(t["status"] == "done" for t in ts),
            "completion_pct": _pct(sum(t["status"] == "done" for t in ts), len(ts)) or 0,
            "accuracy": round(sum(scored) / len(scored)) if scored else None,
            "sessions": subj_items[s.id],
        })

    # ---------------- planned vs actual, last 14 days
    window = [today - timedelta(days=d) for d in range(13, -1, -1)]
    planned_by_day: dict[date, int] = defaultdict(int)
    actual_by_day: dict[date, int] = defaultdict(int)
    for i in items:
        if i.kind == "buffer":
            continue
        planned_by_day[i.date] += i.minutes
        if i.status == "done" and i.completed_at:
            actual_by_day[i.completed_at.date()] += i.minutes
    planned_vs_actual = [
        {"date": d.isoformat(), "planned": planned_by_day.get(d, 0), "actual": actual_by_day.get(d, 0)} for d in window
    ]

    all_attempts = [a for v in quizzes.values() for a in v]
    total_q = sum(a["total"] for a in all_attempts)
    today_items = [i for i in items if i.date == today and i.kind != "buffer"]

    return {
        "overall": {
            "completion_pct": _pct(sum(t["status"] == "done" for t in topics), len(topics)) or 0,
            "topics": len(topics),
            "topics_done": sum(t["status"] == "done" for t in topics),
            "streak": streak(done_dates, today),
            "best_streak": best_streak(done_dates),
            "accuracy": _pct(sum(a["score"] for a in all_attempts), total_q),
            "quizzes_taken": len(all_attempts),
            "days_left": max(0, (plan.exam_date - today).days),
            "exam_date": plan.exam_date.isoformat(),
            "daily_minutes": plan.daily_minutes,
            "required_daily_minutes": plan.required_daily_minutes,
            "minutes_done_total": sum(i.minutes for i in items if i.status == "done" and i.kind != "buffer"),
            "sessions_missed_total": sum(1 for i in items if i.status == "missed" and i.kind != "buffer"),
            "today_planned": sum(i.minutes for i in today_items),
            "today_done": sum(i.minutes for i in today_items if i.status == "done"),
        },
        "accuracy_by_difficulty": _difficulty_accuracy(db, topic_ids),
        "subjects": subjects,
        "topics": topics,
        "weak_topics": weak_topics,
        "planned_vs_actual": planned_vs_actual,
    }


def weekly(db: Session, plan: Plan, today: date) -> dict:
    """Last-7-days stats for the blunt review (compact on purpose: it's sent to Claude)."""
    start = today - timedelta(days=6)
    full = compute(db, plan, today)
    rows = list(iter_topics(plan))
    topic_meta = {t.id: (s, t) for s, _u, t, _ in rows}

    items = db.scalars(
        select(ScheduleItem).where(
            ScheduleItem.plan_id == plan.id, ScheduleItem.date >= start, ScheduleItem.date <= today,
            ScheduleItem.kind != "buffer",
        )
    ).all()
    per_subject: dict[int, dict] = {}
    for s in plan.subjects:
        per_subject[s.id] = {"name": s.name, "strength": s.strength, "planned": 0, "done": 0, "missed": 0,
                             "planned_days": set(), "missed_days": set()}
    for i in items:
        if not i.topic_id or i.topic_id not in topic_meta:
            continue
        if i.date == today and i.status == "pending":
            continue  # today isn't over yet
        s, _ = topic_meta[i.topic_id]
        ps = per_subject[s.id]
        ps["planned"] += 1
        ps["planned_days"].add(i.date)
        if i.status == "done":
            ps["done"] += 1
        elif i.status == "missed":
            ps["missed"] += 1
            ps["missed_days"].add(i.date)
    subjects = []
    for ps in per_subject.values():
        ps["days_planned"] = len(ps.pop("planned_days"))
        ps["days_with_misses"] = len(ps.pop("missed_days"))
        subjects.append(ps)

    week_quizzes = db.scalars(
        select(Quiz).where(Quiz.submitted_at.is_not(None), Quiz.topic_id.in_(list(topic_meta)))
    ).all()
    quiz_rows = []
    for q in week_quizzes:
        if q.submitted_at.date() < start:
            continue
        s, t = topic_meta[q.topic_id]
        quiz_rows.append({"subject": s.name, "topic": t.name, "accuracy": _pct(q.score, q.total)})

    weak = [
        {"subject": t["subject"], "topic": t["name"], "accuracy": t["accuracy"], "missed_sessions": t["missed"]}
        for t in full["weak_topics"][:6]
    ]
    finished_this_week = [
        t.name for _s, t in topic_meta.values()
        if t.status == "done" and t.completed_at and start <= t.completed_at.date() <= today
    ]
    untested = [n for n in finished_this_week if not any(q["topic"] == n for q in quiz_rows)]
    return {
        "period": {"from": start.isoformat(), "to": today.isoformat()},
        "week": {
            "sessions_planned": sum(s["planned"] for s in subjects),
            "sessions_done": sum(s["done"] for s in subjects),
            "sessions_missed": sum(s["missed"] for s in subjects),
            "minutes_planned": sum(d["planned"] for d in full["planned_vs_actual"][-7:]),
            "minutes_done": sum(d["actual"] for d in full["planned_vs_actual"][-7:]),
            "topics_finished": finished_this_week,
            "finished_but_not_quizzed": untested,
            "quizzes": quiz_rows,
        },
        "subjects": subjects,
        "weak_topics": weak,
        "overall": {k: full["overall"][k] for k in (
            "completion_pct", "topics", "topics_done", "streak", "accuracy", "days_left", "exam_date",
            "daily_minutes", "required_daily_minutes",
        )},
    }
