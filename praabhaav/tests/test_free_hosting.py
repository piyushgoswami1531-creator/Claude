import os
import sqlite3
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app import copydb
from app import db as dbmod
from app.agent import QueryAgent
from app.main import create_app
from app.scheduler import Scheduler

PG_URL = os.environ.get("TEST_DATABASE_URL")


class FakeNotifier:
    configured = True

    def __init__(self):
        self.sent = []

    def send(self, text):
        self.sent.append(text)
        return True


@pytest.fixture(autouse=True)
def env(monkeypatch):
    for var in ("ANTHROPIC_API_KEY", "APIFY_TOKEN", "ENABLE_SCHEDULER", "DATABASE_URL",
                "REQUIRE_DATABASE_URL", "CRON_SECRET"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("ADMIN_PASSWORD", "owner-password")
    monkeypatch.setenv("SECRET_KEY", "test-secret")


def make(tmp_path, notifier=None):
    app = create_app(str(tmp_path / "f.db"), agent=QueryAgent(client=None),
                     notifier=notifier or FakeNotifier())
    return TestClient(app), app.state.ctx


# --- /cron/run ----------------------------------------------------------------------------

def test_cron_endpoint_needs_the_secret(tmp_path, monkeypatch):
    c, _ = make(tmp_path)
    assert c.get("/cron/run?key=anything").status_code == 404  # no CRON_SECRET: off
    monkeypatch.setenv("CRON_SECRET", "s3cret-value")
    assert c.get("/cron/run").status_code == 404
    assert c.get("/cron/run?key=wrong").status_code == 404


def test_cron_endpoint_runs_the_scheduled_jobs(tmp_path, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "s3cret-value")
    notifier = FakeNotifier()
    c, ctx = make(tmp_path, notifier)
    ran = []
    monkeypatch.setattr(ctx.scheduler, "tick", lambda now: ran.append(now) or ["digest"])
    r = c.get("/cron/run?key=s3cret-value")
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert len(ran) == 1  # ran in the background task after the response
    assert c.post("/cron/run?key=s3cret-value").status_code == 200  # POST works too


def test_run_tick_skips_while_a_tick_is_running(tmp_path):
    db = dbmod.Database(str(tmp_path / "l.db"))
    s = Scheduler(db, None, FakeNotifier(), "")
    s._lock.acquire()
    try:
        assert s.run_tick() is None
    finally:
        s._lock.release()
    assert s.run_tick() is not None


def test_verify_tolerates_a_slightly_early_cron(tmp_path):
    class Fetcher:
        def fetch(self, urls):
            return {}

    db = dbmod.Database(str(tmp_path / "v.db"))
    db.set_setting("last_digest_date", "2026-10-09")
    db.set_setting("last_views_date", "2026-10-09")
    s = Scheduler(db, Fetcher(), FakeNotifier(), "")
    t = lambda h, m: datetime(2026, 10, 9, h, m, tzinfo=timezone.utc)
    assert s.tick(t(5, 0)) == ["verify"]
    assert s.tick(t(5, 29)) == ["verify"]  # cron fired 1 min early: still runs


# --- health check doesn't wake the database --------------------------------------------

def test_healthz_skips_the_database(tmp_path, monkeypatch):
    c, ctx = make(tmp_path)

    def boom(*a, **k):
        raise RuntimeError("database touched")

    monkeypatch.setattr(ctx.db, "get_setting", boom)
    assert c.get("/healthz").json() == {"ok": True}
    with pytest.raises(RuntimeError):
        c.get("/healthz?deep=1")


# --- refusing to run on a temporary disk -----------------------------------------------------

def test_requires_database_url_on_free_hosting(monkeypatch):
    monkeypatch.setenv("REQUIRE_DATABASE_URL", "1")
    with pytest.raises(RuntimeError, match="DATABASE_URL is not set"):
        create_app(agent=QueryAgent(client=None), notifier=FakeNotifier())


def test_database_target_prefers_database_url(monkeypatch):
    monkeypatch.setenv("PRAABHAAV_DB", "/data/x.db")
    assert dbmod.database_target_from_env() == "/data/x.db"
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/db")
    assert dbmod.database_target_from_env() == "postgresql://u:p@host/db"


# --- copying data (backups, moving to Neon) -------------------------------------------------

def seed(db):
    cid = db.create_campaign("Monsoon", "Baarish", "XYZ", 600)
    db.add_submission(cid, "riya", "9876543210", "riya@okaxis", "https://www.instagram.com/reel/A/")
    db.add_roster_row(cid, handle="riya", followers=1000, price=500)
    db.save_snapshot(cid, "2026-10-09", 1234, 1)
    db.set_daily_limit(50_000)
    return cid


@pytest.mark.sqlite_only
def test_copydb_sqlite_to_sqlite(tmp_path, capsys):
    src_path, dst_path = str(tmp_path / "src.db"), str(tmp_path / "dst.db")
    seed(dbmod.Database(src_path))
    assert copydb.main([src_path, dst_path]) == 0
    assert "submissions" in capsys.readouterr().out
    dst = dbmod.Database(dst_path)
    assert dst.get_submission(1)["ig_handle"] == "riya"
    assert dst.get_daily_limit() == 50_000
    assert dst.list_snapshots(1)[0]["views"] == 1234
    # Refuses to merge into a database that already has data.
    assert copydb.main([src_path, dst_path]) == 1


@pytest.mark.skipif(not PG_URL, reason="needs TEST_DATABASE_URL (Postgres)")
@pytest.mark.own_database  # uses a real SQLite file and its own Postgres schema
def test_copy_sqlite_backup_into_postgres_and_keep_going(tmp_path):
    import psycopg

    with psycopg.connect(PG_URL, autocommit=True) as conn:
        conn.execute("DROP SCHEMA IF EXISTS copytest CASCADE")
    src = dbmod.Database(str(tmp_path / "old.db"))
    seed(src)
    src.create_campaign("Second", "", "", 0)
    dst = dbmod.Database(PG_URL, schema="copytest")
    try:
        counts = src.copy_into(dst)
        assert counts["campaigns"] == 2 and counts["submissions"] == 1
        assert dst.get_campaign(2)["name"] == "Second"
        # Sequences moved past the copied ids, so new rows don't collide.
        assert dst.create_campaign("Third", "", "", 0) == 3
        # And a Postgres database backs up to a plain SQLite file.
        backup = tmp_path / "backup.db"
        dst.backup_to(str(backup))
        names = [r[0] for r in sqlite3.connect(backup).execute("SELECT name FROM campaigns ORDER BY id")]
        assert names == ["Monsoon", "Second", "Third"]
    finally:
        dst.close()
