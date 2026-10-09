from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_today, require_plan
from ..models import Plan, Review
from ..serializers import review_out
from ..services import planning, stats
from ..services.ai import review as ai_review

router = APIRouter(prefix="/api", tags=["stats"])


@router.get("/stats")
def get_stats(plan: Plan = Depends(require_plan), db: Session = Depends(get_db), today: date = Depends(get_today)):
    if planning.auto_replan(db, plan, today):
        plan = planning.load_plan(db, plan.id)
    return stats.compute(db, plan, today)


@router.post("/reviews")
def create_review(plan: Plan = Depends(require_plan), db: Session = Depends(get_db), today: date = Depends(get_today)):
    if planning.auto_replan(db, plan, today):
        plan = planning.load_plan(db, plan.id)
    week = stats.weekly(db, plan, today)
    out = ai_review.generate(week)
    review = Review(
        plan_id=plan.id, week_start=today - timedelta(days=6), stats=week,
        verdict=out.verdict, findings=out.findings, actions=out.actions,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review_out(review)


@router.get("/reviews")
def list_reviews(plan: Plan = Depends(require_plan), db: Session = Depends(get_db)):
    rows = db.scalars(select(Review).where(Review.plan_id == plan.id).order_by(Review.id.desc()).limit(20))
    return [review_out(r) for r in rows]
