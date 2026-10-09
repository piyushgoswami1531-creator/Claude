import sqlite3
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app import db as dbmod
from app.agent import QueryAgent
from app.main import create_app
from app.scheduler import Scheduler

ADMIN = ("admin", "secret")


class FakeNotifier:
    configured = True

    def __init__(self):
        self.sent = []

    def send(self, text):
        self.sent.append(text)
        return True


class CountingFetcher:
    def __init__(self):
        self.calls = 0

    def fetch(self, urls):
        self.calls += 1
        return {}


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for var in ("ANTHROPIC_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "APIFY_TOKEN",
                "ENABLE_SCHEDULER"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("ADMIN_PASSWORD", "secret")


def utc(h, m, day=9):
    return datetime(2026, 10, day, h, m, tzinfo=timezone.utc)  # IST = UTC + 5:30


def test_digest_runs_once_per_day_after_0930_ist(tmp_path):
    db = dbmod.Database(str(tmp_path / "s.db"))
    notifier = FakeNotifier()
    s = Scheduler(db, None, notifier, "https://ops.example")
    assert s.tick(utc(3, 59)) == []            # 09:29 IST
    assert s.tick(utc(4, 0)) == ["digest"]     # 09:30 IST
    assert s.tick(utc(10, 0)) == []            # later the same day
    # A restart (new Scheduler) doesn't resend: the date is stored in the database.
    assert Scheduler(db, None, notifier, "").tick(utc(11, 0)) == []
    assert s.tick(utc(4, 0, day=10)) == ["digest"]
    assert len(notifier.sent) == 2 and "daily summary" in notifier.sent[0]


def test_verify_runs_every_30_minutes(tmp_path):
    db = dbmod.Database(str(tmp_path / "s.db"))
    db.set_setting("last_digest_date", "2026-10-09")
    s = Scheduler(db, CountingFetcher(), FakeNotifier(), "")
    assert s.tick(utc(5, 0)) == ["verify"]
    assert s.tick(utc(5, 20)) == []
    assert s.tick(utc(5, 30)) == ["verify"]


def test_healthz_and_backup(tmp_path):
    c = TestClient(create_app(str(tmp_path / "h.db"), agent=QueryAgent(client=None),
                              notifier=FakeNotifier()))
    assert c.get("/healthz").json() == {"ok": True}
    c.post("/admin/campaigns", auth=ADMIN, data={"name": "Monsoon", "default_amount": 500})
    assert c.get("/admin/backup").status_code == 401
    r = c.get("/admin/backup", auth=ADMIN)
    assert r.status_code == 200
    backup = tmp_path / "restored.db"
    backup.write_bytes(r.content)
    assert sqlite3.connect(backup).execute("SELECT name FROM campaigns").fetchone() == ("Monsoon",)


def test_scheduler_starts_with_app_when_enabled(tmp_path, monkeypatch):
    monkeypatch.setenv("ENABLE_SCHEDULER", "1")
    notifier = FakeNotifier()
    app = create_app(str(tmp_path / "e.db"), agent=QueryAgent(client=None), notifier=notifier)
    with TestClient(app) as c:  # runs lifespan startup/shutdown
        assert c.get("/healthz").status_code == 200
