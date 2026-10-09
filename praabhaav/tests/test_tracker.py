import pytest
from fastapi.testclient import TestClient

from app import tracker
from app.agent import QueryAgent
from app.main import create_app


class FakeApify:
    """Stands in for ApifyReelFetcher: reels by shortcode, profiles by username."""

    def __init__(self, reels=None, profiles=None, error=None):
        self.reels = reels or {}
        self.profiles = profiles or {}
        self.error = error

    def fetch(self, urls):
        if self.error:
            raise self.error
        return self.reels

    def fetch_profiles(self, usernames):
        if self.error:
            raise self.error
        return self.profiles


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
def make(tmp_path):
    def _make(fetcher=None):
        app = create_app(str(tmp_path / "t.db"), agent=QueryAgent(client=None),
                         notifier=SilentNotifier(), fetcher=fetcher)
        c = TestClient(app)
        c.post("/login", data={"username": "admin", "password": "owner-password"})
        c.post("/admin/campaigns", data={"name": "Monsoon Launch", "song": "Baarish"})
        return c, app.state.ctx.db
    return _make


def add(c, **data):
    payload = {"profile_url": "@riya", "followers": "", "post_link": "", "price": "",
               "reel_url": "", **data}
    return c.post("/admin/api/campaigns/1/rows", json=payload)


# --- parsing ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw,handle", [
    ("@Riya.Dances", "riya.dances"),
    ("riya_dances", "riya_dances"),
    ("https://www.instagram.com/riya.dances/?hl=en", "riya.dances"),
    ("instagram.com/riya", "riya"),
])
def test_parse_profile(raw, handle):
    assert tracker.parse_profile(raw) == (handle, f"https://www.instagram.com/{handle}/")


@pytest.mark.parametrize("raw", ["", "https://www.instagram.com/reel/AbC/", "not a handle!"])
def test_parse_profile_rejects(raw):
    with pytest.raises(ValueError):
        tracker.parse_profile(raw)


@pytest.mark.parametrize("raw,value", [
    ("12,500", 12500), ("12.5K", 12500), ("1.2M", 1200000), ("1.5L", 150000),
    ("2 lakh", 200000), ("₹1,500", 1500), ("", None), (None, None), (900, 900),
])
def test_parse_count(raw, value):
    assert tracker.parse_count(raw) == value


def test_totals_and_cpm():
    rows = [
        {"price": 1000, "views": 50_000, "likes": 10, "followers": 1000, "reel_url": "x"},
        {"price": 3000, "views": 50_000, "likes": 5, "followers": 2000, "reel_url": "y"},
        {"price": 500, "views": None, "likes": None, "followers": None, "reel_url": ""},
    ]
    t = tracker.totals(rows)
    assert t["spend"] == 4500 and t["views"] == 100_000 and t["live"] == 2
    assert t["cpm"] == 40.0  # (1000+3000) per 100K views -> ₹40 per 1K
    assert tracker.row_cpm(rows[0]) == 20.0 and tracker.row_cpm(rows[2]) is None


def test_csv_import_maps_messy_headers():
    text = ("﻿Creator Name,Profile Link,Followers,Rate (₹),Live Reel Link,Live Views,Remarks\n"
            "Riya,https://instagram.com/riya,12.5K,\"₹1,500\",https://www.instagram.com/reel/AbC/,90K,ok\n"
            ",,,,,,\n"
            "bad!!,,x,1,,,\n")
    rows, problems = tracker.parse_csv(text)
    assert rows == [{"handle": "riya", "profile_url": "https://www.instagram.com/riya/",
                     "followers": 12500, "price": 1500,
                     "reel_url": "https://www.instagram.com/reel/AbC/", "notes": "ok"}]
    assert len(problems) == 1 and problems[0].startswith("Row 4")


# --- pages & API ---------------------------------------------------------------------------

def test_add_edit_delete_rows(make):
    c, db = make()
    r = add(c, profile_url="https://www.instagram.com/riya/", followers="12.5K", price="1500",
            reel_url="https://www.instagram.com/reel/AbC/?igsh=1")
    assert r.status_code == 200
    data = r.json()
    assert 'data-row-id="1"' in data["row_html"] and "12.5K" in data["row_html"]
    assert "₹1,500" in data["totals_html"]
    row = db.get_roster_row(1)
    assert row["reel_url"] == "https://www.instagram.com/reel/AbC/" and row["followers"] == 12500

    r = c.patch("/admin/api/rows/1", json={"price": "2,000", "notes": "Top performer"})
    assert r.status_code == 200 and "₹2,000" in r.json()["totals_html"]
    assert db.get_roster_row(1)["notes"] == "Top performer"

    r = c.patch("/admin/api/rows/1", json={"handle": "@riya.new"})
    assert db.get_roster_row(1)["profile_url"] == "https://www.instagram.com/riya.new/"

    r = c.patch("/admin/api/rows/1", json={"followers": "lots"})
    assert r.status_code == 400 and "Can't read the number" in r.json()["error"]
    r = c.patch("/admin/api/rows/1", json={"reel_url": "javascript:alert(1)"})
    assert r.status_code == 400

    assert c.delete("/admin/api/rows/1").status_code == 200
    assert db.list_roster(1) == []


def test_add_row_validation(make):
    c, _ = make()
    r = add(c, profile_url="")
    assert r.status_code == 400 and "handle" in r.json()["error"]


def test_tracker_page_and_campaign_cards(make):
    c, _ = make()
    add(c, profile_url="@riya", price="1500")
    page = c.get("/admin/campaigns/1")
    assert page.status_code == 200 and "riya" in page.text and "Monsoon Launch" in page.text
    assert "Set APIFY_TOKEN" in page.text  # live stats disabled without a token
    cards = c.get("/admin/campaigns")
    assert "Monsoon Launch" in cards.text and "/admin/campaigns/1" in cards.text


def test_import_and_export_round_trip(make):
    c, db = make()
    csv_text = "Handle,Followers,Price,Live reel link\n@riya,10K,1000,https://www.instagram.com/reel/AbC/\n@aman,2.5K,500,\n"
    r = c.post("/admin/campaigns/1/import", files={"file": ("sheet.csv", csv_text, "text/csv")},
               follow_redirects=False)
    assert r.status_code == 303 and "imported=2" in r.headers["location"]
    assert [row["handle"] for row in db.list_roster(1)] == ["riya", "aman"]
    out = c.get("/admin/campaigns/1/export.csv")
    assert out.status_code == 200 and "monsoon-launch-tracker.csv" in out.headers["content-disposition"]
    assert "riya,https://www.instagram.com/riya/,10000" in out.text


def test_refresh_views_and_followers(make):
    apify = FakeApify(
        reels={"AbC": {"shortCode": "AbC", "videoPlayCount": 48210, "likesCount": 3120,
                       "commentsCount": 88}},
        profiles={"riya": {"username": "riya", "followersCount": 15200},
                  "aman": {"username": "aman", "followersCount": 3100}},
    )
    c, db = make(apify)
    add(c, profile_url="@riya", price="1000", reel_url="https://www.instagram.com/reel/AbC/")
    add(c, profile_url="@aman", reel_url="https://www.instagram.com/reel/Gone/")

    r = c.post("/admin/api/campaigns/1/refresh?kind=views")
    assert r.status_code == 202
    job = c.get("/admin/api/campaigns/1/job").json()  # background task already ran
    assert job["state"] == "done" and job["message"] == "Updated views for 1 reel, 1 not found."
    assert "48.2K" in job["body_html"] and "Reel not found" in job["body_html"]
    assert db.get_roster_row(1)["views"] == 48210

    c.post("/admin/api/campaigns/1/refresh?kind=followers")
    job = c.get("/admin/api/campaigns/1/job").json()
    assert job["message"] == "Updated followers for 2 creators."
    assert db.get_roster_row(2)["followers"] == 3100


def test_refresh_errors(make):
    c, _ = make(None)
    r = c.post("/admin/api/campaigns/1/refresh?kind=views")
    assert r.status_code == 400 and "APIFY_TOKEN" in r.json()["error"]

    c, _ = make(FakeApify(error=RuntimeError("down")))
    add(c, profile_url="@riya", reel_url="https://www.instagram.com/reel/AbC/")
    c.post("/admin/api/campaigns/1/refresh?kind=views")
    job = c.get("/admin/api/campaigns/1/job").json()
    assert job["state"] == "error" and "Couldn't reach Apify" in job["message"]


def test_api_requires_host_login(make):
    c, _ = make()
    c.cookies.clear()
    r = add(c)
    assert r.status_code == 401 and r.json()["error"] == "Please log in again."
    assert c.get("/admin/campaigns/1", follow_redirects=False).status_code == 303
