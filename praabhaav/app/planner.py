"""Payment planner: splits the payout queue across days under the daily UPI limit.

Strictly oldest-first (the order promised in the FAQ): a payment that doesn't fit
in today's remaining limit moves to tomorrow, and nothing behind it jumps ahead.
A single payment bigger than the whole daily limit gets a day to itself and is
flagged, because it has to be split or paid another way (e.g. bank transfer).
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from .db import IST, Database


@dataclass
class PlannedPayment:
    submission: object  # sqlite3.Row from Database.payout_queue()
    pay_date: date
    over_limit: bool = False


def today_ist() -> date:
    return datetime.now(IST).date()


def plan_payouts(queue, daily_limit: int, paid_today: int, today: date) -> list[PlannedPayment]:
    if daily_limit <= 0:
        return []
    plan: list[PlannedPayment] = []
    day = today
    remaining = max(daily_limit - paid_today, 0)
    for s in queue:
        amount = s["amount"]
        if amount > daily_limit:
            if remaining < daily_limit:  # day already partly used
                day += timedelta(days=1)
            plan.append(PlannedPayment(s, day, over_limit=True))
            day += timedelta(days=1)
            remaining = daily_limit
            continue
        if amount > remaining:
            day += timedelta(days=1)
            remaining = daily_limit
        plan.append(PlannedPayment(s, day))
        remaining -= amount
    return plan


def current_plan(db: Database, today: date | None = None) -> list[PlannedPayment]:
    today = today or today_ist()
    start_of_today = datetime(today.year, today.month, today.day, tzinfo=IST)
    return plan_payouts(
        db.payout_queue(), db.get_daily_limit(), db.paid_since(start_of_today), today
    )


def expected_dates(db: Database) -> dict[int, date]:
    """submission id -> expected payment date, for status pages and the agent."""
    return {p.submission["id"]: p.pay_date for p in current_plan(db)}


def group_by_day(plan: list[PlannedPayment]) -> list[tuple[date, list[PlannedPayment], int]]:
    days: dict[date, list[PlannedPayment]] = {}
    for p in plan:
        days.setdefault(p.pay_date, []).append(p)
    return [(d, items, sum(p.submission["amount"] for p in items)) for d, items in days.items()]
