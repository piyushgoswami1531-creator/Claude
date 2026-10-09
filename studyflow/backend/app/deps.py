from datetime import date

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .db import get_db
from .models import Plan, User
from .services.auth import COOKIE_NAME, read_token
from .services.planning import active_plan


def get_today() -> date:
    """Overridden in tests to simulate missed days."""
    return date.today()


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    user_id = read_token(token) if token else None
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(401, "Please log in.")
    return user


def require_plan(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Plan:
    plan = active_plan(db, user.id)
    if plan is None:
        raise HTTPException(404, "No study plan yet. Create one first.")
    return plan
