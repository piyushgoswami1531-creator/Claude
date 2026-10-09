"""DB-facing planning: create a plan, re-plan after missed days, complete topics."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from ..models import Plan, ScheduleItem, Subject, Topic, Unit
from . import scheduler
from .scheduler import REVISION_INTERVALS, SeedRevision, TopicIn

PALETTE_SLOTS = 8


def load_plan(db: Session, plan_id: int) -> Plan | None:
    return db.scalar(
        select(Plan)
        .where(Plan.id == plan_id)
        .options(selectinload(Plan.subjects).selectinload(Subject.units).selectinload(Unit.topics))
    )


def active_plan(db: Session, user_id: int) -> Plan | None:
    pid = db.scalar(
        select(Plan.id).where(Plan.user_id == user_id, Plan.is_active.is_(True)).order_by(Plan.id.desc())
    )
    return load_plan(db, pid) if pid else None


def iter_topics(plan: Plan):
    order = 0
    for s in plan.subjects:
        for u in s.units:
            for t in u.topics:
                yield s, u, t, order
                order += 1


def create_plan(db: Session, data, today: date, user_id: int) -> Plan:
    """`data` is the validated PlanCreate request model."""
    for old in db.scalars(select(Plan).where(Plan.user_id == user_id, Plan.is_active.is_(True))):
        old.is_active = False

    plan = Plan(user_id=user_id, exam_date=data.exam_date, daily_minutes=round(data.daily_hours * 60), is_active=True, version=0)
    for si, s in enumerate(data.subjects):
        subject = Subject(name=s.name, strength=s.strength, color=f"c{si % PALETTE_SLOTS + 1}", position=si)
        for ui, u in enumerate(s.units):
            unit = Unit(name=u.name, position=ui)
            for ti, t in enumerate(u.topics):
                unit.topics.append(Topic(name=t.name, difficulty=t.difficulty, est_minutes=t.est_minutes, position=ti))
            subject.units.append(unit)
        plan.subjects.append(subject)
    db.add(plan)
    db.flush()
    replan(db, plan, today)
    db.commit()
    return load_plan(db, plan.id)


def _learned_minutes(db: Session, plan: Plan) -> dict[int, int]:
    rows = db.execute(
        select(ScheduleItem.topic_id, ScheduleItem.minutes).where(
            ScheduleItem.plan_id == plan.id, ScheduleItem.kind == "learn", ScheduleItem.status == "done"
        )
    ).all()
    out: dict[int, int] = {}
    for tid, m in rows:
        out[tid] = out.get(tid, 0) + m
    return out


def _done_revisions(db: Session, plan: Plan) -> set[tuple[int, int]]:
    rows = db.execute(
        select(ScheduleItem.topic_id, ScheduleItem.rev_interval).where(
            ScheduleItem.plan_id == plan.id, ScheduleItem.kind == "revise", ScheduleItem.status == "done"
        )
    ).all()
    return {(t, i) for t, i in rows}


def mark_missed(db: Session, plan: Plan, today: date) -> int:
    missed = db.scalars(
        select(ScheduleItem).where(
            ScheduleItem.plan_id == plan.id, ScheduleItem.status == "pending", ScheduleItem.date < today
        )
    ).all()
    for item in missed:
        # A buffer day nobody used isn't a failure - it's slack. Only real work counts as missed.
        item.status = "missed"
    return sum(1 for i in missed if i.kind != "buffer")


def replan(db: Session, plan: Plan, today: date) -> dict:
    """Rebuild every pending item from `today` to the exam. Keeps history intact."""
    newly_missed = mark_missed(db, plan, today)
    db.execute(
        delete(ScheduleItem).where(
            ScheduleItem.plan_id == plan.id, ScheduleItem.status == "pending", ScheduleItem.date >= today
        )
    )
    learned = _learned_minutes(db, plan)
    done_revs = _done_revisions(db, plan)

    topics: list[TopicIn] = []
    seeds: list[SeedRevision] = []
    for s, _u, t, order in iter_topics(plan):
        full = scheduler.weighted_minutes(t.est_minutes, t.difficulty, s.strength)
        if t.status == "done":
            remaining = 0
            if t.completed_at:
                finished = t.completed_at.date()
                for interval in REVISION_INTERVALS:
                    if (t.id, interval) not in done_revs:
                        seeds.append(
                            SeedRevision(
                                due=max(finished + timedelta(days=interval), today),
                                topic_id=t.id,
                                minutes=scheduler.revision_minutes(full),
                                interval=interval,
                            )
                        )
        else:
            remaining = max(scheduler.MIN_CHUNK, full - learned.get(t.id, 0))
        topics.append(
            TopicIn(
                id=t.id, subject_id=s.id, strength=s.strength, minutes=remaining,
                difficulty=t.difficulty, order=order, full_minutes=full,
            )
        )

    used_today = sum(
        db.scalars(
            select(ScheduleItem.minutes).where(
                ScheduleItem.plan_id == plan.id, ScheduleItem.date == today, ScheduleItem.status == "done"
            )
        ).all()
    )
    result = scheduler.build_schedule(topics, today, plan.exam_date, plan.daily_minutes, seeds, used_today)

    plan.version = (plan.version or 0) + 1
    plan.required_daily_minutes = result.required_daily_minutes if result.overloaded else None
    for it in result.items:
        db.add(
            ScheduleItem(
                plan_id=plan.id, date=it.date, topic_id=it.topic_id, kind=it.kind, rev_interval=it.rev_interval,
                minutes=it.minutes, status="pending", plan_version=plan.version,
            )
        )
    db.flush()
    return {"version": plan.version, "missed": newly_missed, "overloaded": result.overloaded}


def auto_replan(db: Session, plan: Plan, today: date) -> dict | None:
    """Re-plan only if something in the past was left undone. Idempotent."""
    stale = db.scalar(
        select(ScheduleItem.id).where(
            ScheduleItem.plan_id == plan.id, ScheduleItem.status == "pending", ScheduleItem.date < today
        ).limit(1)
    )
    if stale is None:
        return None
    info = replan(db, plan, today)
    db.commit()
    return info


def set_item_status(db: Session, item: ScheduleItem, done: bool) -> dict:
    """Tick/untick a schedule item. Returns whether this finished a topic."""
    now = datetime.now()
    topic_completed = False
    if done:
        item.status, item.completed_at = "done", now
    else:
        item.status, item.completed_at = "pending", None

    if item.kind == "learn" and item.topic_id:
        topic = db.get(Topic, item.topic_id)
        if done:
            open_chunks = db.scalar(
                select(ScheduleItem.id).where(
                    ScheduleItem.topic_id == topic.id, ScheduleItem.kind == "learn",
                    ScheduleItem.status == "pending", ScheduleItem.id != item.id,
                ).limit(1)
            )
            if open_chunks is None and topic.status != "done":
                topic.status, topic.completed_at = "done", now
                topic_completed = True
        elif topic.status == "done":
            topic.status, topic.completed_at = "pending", None
    db.commit()
    return {"topic_completed": topic_completed, "topic_id": item.topic_id if topic_completed else None}


def complete_topic(db: Session, plan: Plan, topic: Topic, today: date) -> dict:
    """Student finished a topic (possibly ahead of plan): close it and rebalance the rest."""
    now = datetime.now()
    for item in db.scalars(
        select(ScheduleItem).where(
            ScheduleItem.topic_id == topic.id, ScheduleItem.kind == "learn",
            ScheduleItem.status == "pending", ScheduleItem.date == today,
        )
    ):
        item.status, item.completed_at = "done", now
    topic.status, topic.completed_at = "done", now
    db.flush()
    info = replan(db, plan, today)
    db.commit()
    return info
