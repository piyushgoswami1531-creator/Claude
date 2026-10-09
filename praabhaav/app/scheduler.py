"""Scheduler for the recurring jobs.

Two ways to drive it, both using the same Scheduler object:
- ENABLE_SCHEDULER=1: a loop inside the web process ticks every minute
  (paid hosting with an always-on instance).
- GET /cron/run?key=CRON_SECRET from an outside cron service such as
  cron-job.org every 30 minutes (free hosting: the instance may sleep, and an
  every-minute loop would keep a scale-to-zero database like Neon awake).

- Reel checks every 30 minutes (only if APIFY_TOKEN is set).
- Live views for active campaigns' trackers once a day at 08:30 IST (APIFY_TOKEN).
- Daily summary to Telegram at 09:30 IST, at most once per day even across restarts.
"""

import asyncio
import logging
import threading
from datetime import datetime, time, timedelta

from .db import IST, Database, now_utc
from .digest import build_digest
from .notify import Notifier
from .reels import verify_pending
from .tracker import refresh_views

log = logging.getLogger(__name__)

VERIFY_EVERY = timedelta(minutes=30)
# An outside cron firing every 30 min can arrive a little early; don't skip a round.
VERIFY_SLACK = timedelta(minutes=2)
DIGEST_AT = time(9, 30)  # IST
VIEWS_AT = time(8, 30)  # IST, before the summary so its numbers are fresh


class Scheduler:
    def __init__(self, db: Database, fetcher, notifier: Notifier, base_url: str):
        self.db = db
        self.fetcher = fetcher
        self.notifier = notifier
        self.base_url = base_url
        self.last_verify: datetime | None = None
        self._lock = threading.Lock()

    def run_tick(self) -> list[str] | None:
        """Tick now unless a tick is already running (returns None then)."""
        if not self._lock.acquire(blocking=False):
            log.info("Scheduler tick already running; skipping")
            return None
        try:
            return self.tick(now_utc())
        finally:
            self._lock.release()

    def tick(self, now: datetime) -> list[str]:
        """Run whatever is due at ``now`` (UTC-aware). Returns the jobs that ran."""
        ran = []
        if self.fetcher is not None and (
            self.last_verify is None or now - self.last_verify >= VERIFY_EVERY - VERIFY_SLACK
        ):
            self.last_verify = now
            try:
                verify_pending(self.db, self.fetcher, self.notifier)
                ran.append("verify")
            except Exception:
                log.exception("Scheduled reel check failed")

        local = now.astimezone(IST)
        today = local.date().isoformat()
        if (self.fetcher is not None and local.time() >= VIEWS_AT
                and self.db.get_setting("last_views_date") != today):
            self.db.set_setting("last_views_date", today)
            try:
                refresh_views(self.db, self.db.active_roster_with_reels(), self.fetcher)
                ran.append("views")
            except Exception:
                log.exception("Scheduled views refresh failed")

        if local.time() >= DIGEST_AT and self.db.get_setting("last_digest_date") != today:
            # Mark first so a crash mid-send can't cause repeated summaries.
            self.db.set_setting("last_digest_date", today)
            try:
                self.notifier.send(build_digest(self.db, self.base_url))
                ran.append("digest")
            except Exception:
                log.exception("Scheduled daily summary failed")
        return ran

    async def run_forever(self, interval: float = 60) -> None:
        log.warning("Scheduler started: reel checks %s, daily summary at %s IST",
                    "on" if self.fetcher else "off (no APIFY_TOKEN)", DIGEST_AT.strftime("%H:%M"))
        while True:
            try:
                await asyncio.to_thread(self.run_tick)
            except Exception:
                log.exception("Scheduler tick failed")
            await asyncio.sleep(interval)
