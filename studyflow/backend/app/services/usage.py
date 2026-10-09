"""Per-user daily cap on Claude calls, so a public deployment can't run up your bill."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AiUsage, User
from .ai.client import AIError


def used_today(db: Session, user: User, today: date) -> int:
    return db.scalar(select(AiUsage.count).where(AiUsage.user_id == user.id, AiUsage.day == today)) or 0


def charge(db: Session, user: User, today: date) -> None:
    """Count one Claude call, or raise 429 if the user hit today's limit.

    Demo mode is free, so it isn't counted. The count is committed before the call:
    a failed call still counts, which stops retry loops from bypassing the limit.
    """
    s = get_settings()
    if not s.ai_live or s.daily_ai_limit <= 0:
        return
    exists = db.scalar(select(AiUsage.id).where(AiUsage.user_id == user.id, AiUsage.day == today))
    if exists is None:
        try:
            db.add(AiUsage(user_id=user.id, day=today, count=0))
            db.commit()
        except IntegrityError:  # a parallel request created it first
            db.rollback()
    # Atomic "increment if under the limit": two parallel requests can't both sneak in.
    result = db.execute(
        update(AiUsage)
        .where(AiUsage.user_id == user.id, AiUsage.day == today, AiUsage.count < s.daily_ai_limit)
        .values(count=AiUsage.count + 1)
    )
    db.commit()
    if result.rowcount == 0:
        raise AIError(
            f"You've used all {s.daily_ai_limit} AI requests for today. The limit resets at midnight.", 429
        )
