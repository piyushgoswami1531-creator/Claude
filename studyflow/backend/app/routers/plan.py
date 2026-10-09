from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_today, require_plan
from ..models import Plan, ScheduleItem, Topic
from ..schemas import ItemPatch, PlanCreate
from ..serializers import item_out, plan_out, topic_index
from ..services import planning

router = APIRouter(prefix="/api", tags=["plan"])


@router.post("/plans")
def create_plan(body: PlanCreate, db: Session = Depends(get_db), today: date = Depends(get_today)):
    if body.exam_date <= today:
        raise HTTPException(422, "The exam date must be in the future.")
    if (body.exam_date - today).days > 730:
        raise HTTPException(422, "Pick an exam date within the next two years.")
    plan = planning.create_plan(db, body, today)
    return plan_out(plan)


@router.get("/plans/active")
def get_active(plan: Plan = Depends(require_plan)):
    return plan_out(plan)


@router.post("/plans/active/replan")
def replan(plan: Plan = Depends(require_plan), db: Session = Depends(get_db), today: date = Depends(get_today)):
    info = planning.replan(db, plan, today)
    db.commit()
    return info


def _items(db: Session, plan: Plan, start: date, end: date) -> list[dict]:
    rows = db.scalars(
        select(ScheduleItem)
        .where(ScheduleItem.plan_id == plan.id, ScheduleItem.date >= start, ScheduleItem.date <= end)
        .order_by(ScheduleItem.date, ScheduleItem.id)
    ).all()
    index = topic_index(plan)
    return [item_out(i, index) for i in rows]


@router.get("/schedule/today")
def today_view(plan: Plan = Depends(require_plan), db: Session = Depends(get_db), today: date = Depends(get_today)):
    replanned = planning.auto_replan(db, plan, today)
    if replanned:
        plan = planning.load_plan(db, plan.id)
    tomorrow = today + timedelta(days=1)
    return {
        "date": today.isoformat(),
        "exam_date": plan.exam_date.isoformat(),
        "days_left": (plan.exam_date - today).days,
        "daily_minutes": plan.daily_minutes,
        "required_daily_minutes": plan.required_daily_minutes,
        "replanned": replanned,
        "items": _items(db, plan, today, today),
        "tomorrow": _items(db, plan, tomorrow, tomorrow),
    }


@router.get("/schedule")
def schedule_range(
    start: date = Query(alias="from"),
    end: date = Query(alias="to"),
    plan: Plan = Depends(require_plan),
    db: Session = Depends(get_db),
    today: date = Depends(get_today),
):
    if end < start or (end - start).days > 120:
        raise HTTPException(422, "Range must be 0-120 days.")
    if planning.auto_replan(db, plan, today):
        plan = planning.load_plan(db, plan.id)
    return {"exam_date": plan.exam_date.isoformat(), "today": today.isoformat(), "items": _items(db, plan, start, end)}


@router.patch("/schedule/{item_id}")
def patch_item(item_id: int, body: ItemPatch, plan: Plan = Depends(require_plan), db: Session = Depends(get_db),
               today: date = Depends(get_today)):
    item = db.get(ScheduleItem, item_id)
    if item is None or item.plan_id != plan.id:
        raise HTTPException(404, "Session not found.")
    if item.date > today and body.status == "done":
        raise HTTPException(422, "You can't complete a future session. Use 'Finish topic' to get ahead.")
    if item.status == "missed" and body.status == "done":
        raise HTTPException(422, "That session was missed and has already been re-planned.")
    info = planning.set_item_status(db, item, body.status == "done")
    plan = planning.load_plan(db, plan.id)
    return {"item": item_out(item, topic_index(plan)), **info}


@router.post("/topics/{topic_id}/complete")
def complete_topic(topic_id: int, plan: Plan = Depends(require_plan), db: Session = Depends(get_db),
                   today: date = Depends(get_today)):
    topic = db.get(Topic, topic_id)
    if topic is None or topic.unit.subject.plan_id != plan.id:
        raise HTTPException(404, "Topic not found.")
    if topic.status == "done":
        return {"version": plan.version, "already_done": True}
    return planning.complete_topic(db, plan, topic, today)
