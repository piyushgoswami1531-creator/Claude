"""Model -> JSON shapes used by the frontend."""

from __future__ import annotations

from .models import Plan, Quiz, Review, ScheduleItem


def plan_out(plan: Plan) -> dict:
    return {
        "id": plan.id,
        "exam_date": plan.exam_date.isoformat(),
        "daily_minutes": plan.daily_minutes,
        "version": plan.version,
        "required_daily_minutes": plan.required_daily_minutes,
        "subjects": [
            {
                "id": s.id, "name": s.name, "strength": s.strength, "color": s.color,
                "units": [
                    {
                        "id": u.id, "name": u.name,
                        "topics": [
                            {"id": t.id, "name": t.name, "difficulty": t.difficulty, "est_minutes": t.est_minutes,
                             "status": t.status,
                             "completed_at": t.completed_at.isoformat() if t.completed_at else None}
                            for t in u.topics
                        ],
                    }
                    for u in s.units
                ],
            }
            for s in plan.subjects
        ],
    }


def topic_index(plan: Plan) -> dict[int, dict]:
    out = {}
    for s in plan.subjects:
        for u in s.units:
            for t in u.topics:
                out[t.id] = {"topic": t.name, "topic_status": t.status, "unit": u.name,
                             "subject": s.name, "subject_id": s.id, "color": s.color}
    return out


def item_out(item: ScheduleItem, index: dict[int, dict]) -> dict:
    meta = index.get(item.topic_id, {}) if item.topic_id else {}
    return {
        "id": item.id,
        "date": item.date.isoformat(),
        "kind": item.kind,
        "minutes": item.minutes,
        "status": item.status,
        "rev_interval": item.rev_interval,
        "topic_id": item.topic_id,
        **{k: meta.get(k) for k in ("topic", "topic_status", "unit", "subject", "subject_id", "color")},
    }


def quiz_out(quiz: Quiz, reveal: bool) -> dict:
    t = quiz.topic
    return {
        "id": quiz.id,
        "topic_id": quiz.topic_id,
        "topic": t.name,
        "unit": t.unit.name,
        "subject": t.unit.subject.name,
        "created_at": quiz.created_at.isoformat() if quiz.created_at else None,
        "submitted": quiz.submitted_at is not None,
        "score": quiz.score,
        "total": quiz.total,
        "sources": quiz.sources or [],
        "questions": [
            {
                "id": q.id, "position": q.position, "difficulty": q.difficulty, "question": q.stem,
                "options": q.options, "chosen_index": q.chosen_index,
                **({"correct_index": q.correct_index, "explanation": q.explanation} if reveal else {}),
            }
            for q in quiz.questions
        ],
    }


def review_out(r: Review) -> dict:
    return {
        "id": r.id, "week_start": r.week_start.isoformat(), "verdict": r.verdict,
        "findings": r.findings, "actions": r.actions, "stats": r.stats,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
