"""Daily summary for the core team.

Schedule it once a day, e.g. with cron at 9:30 IST:
    30 9 * * *  cd /path/to/praabhaav && python -m app.digest
"""

import os
from datetime import datetime

from .db import IST, Database, inr, now_utc
from .planner import current_plan, today_ist
from .notify import Notifier


def build_digest(db: Database, base_url: str) -> str:
    stats = db.stats()
    lines = [
        f"📋 Praabhaav daily summary · {datetime.now(IST).strftime('%d %b %Y')}",
        "",
        f"💰 Waiting for payment: {stats['pending']} (₹{inr(stats['pending_amount'])})",
        f"⏰ Overdue >48h: {stats['overdue']}",
    ]
    for r in db.list_overdue()[:10]:
        days = (now_utc() - datetime.fromisoformat(r["submitted_at"])).days
        lines.append(f"   • @{r['ig_handle']} · {r['campaign_name']} · ₹{inr(r['amount'])} · {days}d")
    plan = current_plan(db)
    todays = [p for p in plan if p.pay_date == today_ist()]
    lines.append(
        f"🧾 Today's payment batch: {len(todays)} creators "
        f"(₹{inr(sum(p.submission['amount'] for p in todays))}); "
        f"queue clears by {plan[-1].pay_date:%d %b}" if plan else "🧾 Payment queue is empty"
    )
    lines.append(f"⚠️ Reels with issues: {stats['issues']}")
    lines.append(f"📨 Open escalated queries: {stats['open_tickets']}")
    for t in db.list_tickets("escalated")[:10]:
        lines.append(f"   • #{t['id']} [{t['priority']}] {t['name']}: {t['team_summary'][:100]}")
    lines += ["", f"Open admin: {base_url}/admin"]
    return "\n".join(lines)


def main() -> None:
    db = Database(os.environ.get("PRAABHAAV_DB", "praabhaav.db"))
    base_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000")
    text = build_digest(db, base_url)
    if not Notifier.from_env().send(text):
        print(text)


if __name__ == "__main__":
    main()
