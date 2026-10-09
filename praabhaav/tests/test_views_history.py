import json
import re

import pytest
from fastapi.testclient import TestClient

from app import tracker
from app.agent import QueryAgent
from app.main import create_app
from app.planner import today_ist


class FakeApify:
    def __init__(self, views):
        self.views = views  # shortcode -> views

    def fetch(self, urls):
        return {code: {"shortCode": code, "videoPlayCount": v, "likesCount": 1, "commentsCount": 0}
                for code, v in self.views.items()}

    def fetch_profiles(self, usernames):
        return {}


class SilentNotifier:
    configured = False

    def send(self, text):
        return False


@pytest.fixture(autouse=True)
def env(monkeypatch):
    for var in ("ANTHROPIC_API_KEY", "APIFY_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("ADMIN_PASSWORD", "owner-password")
    monkeypatch.setenv("SECRET_KEY", "test-secret")


@pytest.fixture
def setup(tmp_path):
    apify = FakeApify({"AbC": 1000, "DeF": 500})
    app = create_app(str(tmp_path / "h.db"), agent=QueryAgent(client=None),
                     notifier=SilentNotifier(), fetcher=apify)
    c = TestClient(app)
    db = app.state.ctx.db
    c.post("/login", data={"username": "admin", "password": "owner-password"})
    c.post("/admin/campaigns", data={"name": "Monsoon"})
    db.add_roster_row(1, handle="riya", reel_url="https://www.instagram.com/reel/AbC/")
    db.add_roster_row(1, handle="aman", reel_url="https://www.instagram.com/reel/DeF/")
    db.add_roster_row(1, handle="gone", reel_url="https://www.instagram.com/reel/Gone/")
    return c, db, apify


def series_from(html):
    m = re.search(r"data-series='([^']*)'", html)
    return json.loads(m.group(1).replace("&#34;", '"')) if m else None


def test_refresh_records_todays_snapshot(setup):
    c, db, apify = setup
    c.post("/admin/api/campaigns/1/refresh?kind=views")
    job = c.get("/admin/api/campaigns/1/job").json()
    today = today_ist().isoformat()
    snaps = [dict(s) for s in db.list_snapshots(1)]
    # The deleted reel is excluded, matching the client report's total.
    assert snaps == [{"day": today, "views": 1500, "live_reels": 2}]
    assert "data-series=" in job["chart_html"]
    assert "First data point recorded" in job["chart_html"]

    # A second refresh the same day updates that day's point instead of adding one.
    apify.views = {"AbC": 3000, "DeF": 500}
    c.post("/admin/api/campaigns/1/refresh?kind=views")
    c.get("/admin/api/campaigns/1/job")
    assert [(s["day"], s["views"]) for s in db.list_snapshots(1)] == [(today, 3500)]


def test_chart_on_report_and_campaign_page(setup):
    c, db, _ = setup
    db.save_snapshot(1, "2026-10-01", 1200, 2)
    db.save_snapshot(1, "2026-10-02", 5400, 3)
    db.save_snapshot(1, "2026-10-04", 9100, 3)  # a missed day is fine
    page = c.get("/admin/campaigns/1").text
    assert series_from(page) == [
        {"day": "2026-10-01", "views": 1200, "reels": 2},
        {"day": "2026-10-02", "views": 5400, "reels": 3},
        {"day": "2026-10-04", "views": 9100, "reels": 3},
    ]
    assert "+4,200" in page and "+3,700" in page  # table view: change per day
    c.post("/admin/campaigns/1/report", data={"action": "enable"})
    token = db.get_campaign(1)["report_token"]
    c.cookies.clear()
    report = c.get(f"/r/{token}").text
    assert series_from(report)[-1]["views"] == 9100
    assert "Views over time" in report


def test_empty_state_before_first_refresh(setup):
    c, _, _ = setup
    page = c.get("/admin/campaigns/1").text
    assert "The chart starts after the first views refresh" in page
    assert series_from(page) is None


def test_no_snapshot_without_live_reels(setup):
    _, db, _ = setup
    db.create_campaign("Empty", "", "", 0)
    tracker.record_snapshot(db, 2)
    assert db.list_snapshots(2) == []


def test_scheduled_refresh_snapshots_each_campaign(setup):
    _, db, apify = setup
    other = db.create_campaign("Other", "", "", 0)
    db.add_roster_row(other, handle="neha", reel_url="https://www.instagram.com/reel/DeF/")
    tracker.refresh_views(db, db.active_roster_with_reels(), apify)
    assert db.list_snapshots(1)[0]["views"] == 1500
    assert db.list_snapshots(other)[0]["views"] == 500
