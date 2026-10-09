from datetime import date

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from .db import get_db
from .models import Plan
from .services.planning import active_plan


def get_today() -> date:
    """Overridden in tests to simulate missed days."""
    return date.today()


def require_plan(db: Session = Depends(get_db)) -> Plan:
    plan = active_plan(db)
    if plan is None:
        raise HTTPException(404, "No study plan yet. Create one first.")
    return plan
