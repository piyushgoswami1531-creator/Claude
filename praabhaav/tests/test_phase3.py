import sqlite3
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app import db as dbmod
from app import validation
from app.agent import QueryAgent
from app.digest import build_digest
from app.main import create_app
from app.planner import plan_payouts, today_ist
from app.reels import check_reel, shortcode, verify_pending
from tests.helpers import creator_page, login_creator, submit_reel

ADMIN = ("admin", "secret")
TODAY = date(2026, 10, 9)


def row(id, amount):
    return {"id": id, "amount": amount}


def dates(plan):
    return [(p.submission["id"], (p.pay_date - TODAY).days, p.over_limit) for p in plan]


# --- planner ---------------------------------------------------------------------------

def test_planner_fills_days_up_to_limit():
    queue = [row(1, 40_000), row(2, 40_000), row(3, 30_000), row(4, 10_000)]
    plan = plan_payouts(queue, 100_000, paid_today=0, today=TODAY)
    assert dates(plan) == [(1, 0, False), (2, 0, False), (3, 1, False), (4, 1, False)]


def test_planner_is_strictly_oldest_first():
    # #2 doesn't fit today, so #3 waits too even though it would fit.
    queue = [row(1, 90_000), row(2, 20_000), row(3, 5_000)]
    plan = plan_payouts(queue, 100_000, paid_today=0, today=TODAY)
    assert dates(plan) == [(1, 0, False), (2, 1, False), (3, 1, False)]


def test_planner_counts_money_already_paid_today():
    plan = plan_payouts([row(1, 30_000)], 100_000, paid_today=80_000, today=TODAY)
    assert dates(plan) == [(1, 1, False)]


def test_planner_flags_payment_bigger_than_limit():
    queue = [row(1, 10_000), row(2, 150_000), row(3, 10_000)]
    plan = plan_payouts(queue, 100_000, paid_today=0, today=TODAY)
    assert dates(plan) == [(1, 0, False), (2, 1, True), (3, 2, False)]


def test_planner_without_limit_plans_nothing():
    assert plan_payouts([row(1, 100)], 0, 0, TODAY) == []


# --- reel checks ----------------------------------------------------------------------

def sub(**overrides):
    data = {
        "id": 1, "ig_handle": "riya", "reel_url": "https://www.instagram.com/reel/ABC123/",
        "campaign_name": "Monsoon", "campaign_song": "Baarish Ban Jaana",
        "campaign_audio_id": "",
    }
    data.update(overrides)
    return data


def item(**overrides):
    data = {
        "shortCode": "ABC123", "ownerUsername": "Riya", "videoPlayCount": 12000,
        "likesCount": 900, "commentsCount": 40,
        "musicInfo": {"audio_id": "555", "song_name": "Baarish Ban Jaana (Lofi)",
                      "artist_name": "Payal Dev", "uses_original_audio": False},
    }
    data.update(overrides)
    return data


def test_shortcode_handles_reel_and_p_links():
    assert shortcode("https://www.instagram.com/reel/ABC123/") == "ABC123"
    assert shortcode("https://www.instagram.com/p/ABC123/") == "ABC123"
    assert shortcode("https://example.com") is None


def test_fetcher_keys_error_items_by_url(monkeypatch):
    import httpx
    from app import reels

    # Shapes copied from a real Apify run: a found reel and a deleted one.
    payload = [
        {"inputUrl": "https://www.instagram.com/reel/DePpLegAuKI/",
         "url": "https://www.instagram.com/p/DePpLegAuKI/", "shortCode": "DePpLegAuKI",
         "ownerUsername": "natgeo"},
        {"url": "https://www.instagram.com/reel/Gone123/", "error": "not_found",
         "errorDescription": "Post does not exist"},
    ]
    seen = {}

    def fake_post(url, headers, json, timeout):
        seen.update(url=url, headers=headers, json=json)
        return httpx.Response(200, json=payload, request=httpx.Request("POST", url))

    monkeypatch.setattr(reels.httpx, "post", fake_post)
    items = reels.ApifyReelFetcher("tok").fetch(["https://www.instagram.com/reel/Gone123/"])
    assert seen["headers"]["Authorization"] == "Bearer tok"
    assert "token=" not in seen["url"]
    assert set(items) == {"DePpLegAuKI", "Gone123"}
    res = check_reel(sub(reel_url="https://www.instagram.com/reel/Gone123/"), items["Gone123"])
    assert not res.passed and "not found" in res.reasons[0]


def test_reel_passes_on_song_name_and_owner():
    res = check_reel(sub(), item())
    assert res.passed and res.reasons == []
    assert res.views == 12000 and res.audio_name == "Baarish Ban Jaana (Lofi) – Payal Dev"


def test_reel_passes_on_exact_audio_id():
    assert check_reel(sub(campaign_audio_id="555", campaign_song=""), item()).passed


@pytest.mark.parametrize("s,i,reason", [
    (sub(), None, "not found"),
    (sub(), item(error="not_found"), "not found"),
    (sub(), item(ownerUsername="someone_else"), "Posted by @someone_else"),
    (sub(campaign_audio_id="999"), item(), "not the campaign audio"),
    (sub(), item(musicInfo={"song_name": "Original audio", "uses_original_audio": True}),
     "expected 'Baarish Ban Jaana'"),
    (sub(campaign_song=""), item(), "can't be checked"),
])
def test_reel_fails_with_reason(s, i, reason):
    res = check_reel(s, i)
    assert not res.passed
    assert reason in " ".join(res.reasons)


class FakeFetcher:
    def __init__(self, items=None, error=None):
        self.items = items or {}
        self.error = error
        self.calls = []

    def fetch(self, urls):
        self.calls.append(urls)
        if self.error:
            raise self.error
        return self.items


class FakeNotifier:
    configured = True

    def __init__(self):
        self.sent = []

    def send(self, text):
        self.sent.append(text)
        return True


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for var in ("ANTHROPIC_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "APIFY_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("ADMIN_PASSWORD", "secret")


def seed(c, *creators, amount=500, audio_link=""):
    c.post("/admin/campaigns", auth=ADMIN, data={
        "name": "Monsoon", "song": "Baarish Ban Jaana", "default_amount": amount,
        "audio_link": audio_link,
    })
    for i, handle in enumerate(creators):
        submit_reel(c, {
            "campaign_id": 1, "ig_handle": handle, "whatsapp": f"98765432{i:02d}",
            "upi_id": f"{handle}@okaxis", "upi_confirm": f"{handle}@okaxis",
            "reel_url": f"https://www.instagram.com/reel/CODE{i}/",
        })


@pytest.fixture
def app_env(tmp_path):
    def _make(fetcher=None):
        notifier = FakeNotifier()
        path = str(tmp_path / "p3.db")
        c = TestClient(create_app(path, agent=QueryAgent(client=None), notifier=notifier,
                                  fetcher=fetcher))
        return c, notifier, dbmod.Database(path)
    return _make


def test_verify_pending_approves_and_flags(app_env):
    fetcher = FakeFetcher({
        "CODE0": item(shortCode="CODE0", ownerUsername="riya"),
        "CODE1": item(shortCode="CODE1", ownerUsername="not_aman"),
        # CODE2 missing: deleted reel
    })
    c, notifier, db = app_env(fetcher)
    seed(c, "riya", "aman", "neha")
    counts = verify_pending(db, fetcher, notifier)
    assert counts == {"passed": 1, "failed": 2, "error": 0}
    riya, aman, neha = (db.get_submission(i) for i in (1, 2, 3))
    assert riya["status"] == "approved" and riya["verify_status"] == "passed"
    assert riya["views"] == 12000
    # Failures are flagged, never rejected automatically.
    assert aman["status"] == "submitted" and "Posted by @not_aman" in aman["verify_notes"]
    assert neha["status"] == "submitted" and neha["verify_status"] == "failed"
    assert len(notifier.sent) == 1 and "2 need review" in notifier.sent[0]
    # Checked reels aren't fetched again.
    assert verify_pending(db, fetcher, notifier) == {"passed": 0, "failed": 0, "error": 0}
    assert len(fetcher.calls) == 1


def test_verify_fetch_error_is_retried_next_run(app_env):
    broken = FakeFetcher(error=RuntimeError("apify down"))
    c, notifier, db = app_env(broken)
    seed(c, "riya")
    assert verify_pending(db, broken, notifier)["error"] == 1
    assert db.get_submission(1)["verify_status"] == "error"
    fixed = FakeFetcher({"CODE0": item(shortCode="CODE0", ownerUsername="riya")})
    assert verify_pending(db, fixed, notifier)["passed"] == 1


def test_verify_never_touches_team_decisions(app_env):
    fetcher = FakeFetcher({"CODE0": item(shortCode="CODE0", ownerUsername="riya")})
    c, notifier, db = app_env(fetcher)
    seed(c, "riya")
    c.post("/admin/submissions/1", auth=ADMIN, data={"new_status": "issue", "amount": 500})
    verify_pending(db, fetcher, notifier)
    assert fetcher.calls == []
    assert db.get_submission(1)["status"] == "issue"


def test_verify_endpoint(app_env):
    c, _, _ = app_env(None)
    assert c.post("/admin/verify", auth=ADMIN).status_code == 400
    fetcher = FakeFetcher({"CODE0": item(shortCode="CODE0", ownerUsername="riya")})
    c, _, db = app_env(fetcher)
    seed(c, "riya")
    r = c.post("/admin/verify", auth=ADMIN, follow_redirects=False)
    assert r.status_code == 303
    assert db.get_submission(1)["status"] == "approved"  # background task ran
    assert "passed" in c.get("/admin", auth=ADMIN).text


def test_campaign_audio_link(app_env):
    c, _, db = app_env()
    seed(c, audio_link="https://www.instagram.com/reels/audio/1234567890/")
    assert db.get_campaign(1)["audio_id"] == "1234567890"
    r = c.post("/admin/campaigns", auth=ADMIN,
               data={"name": "X", "audio_link": "https://youtube.com/x"})
    assert r.status_code == 400
    assert validation.clean_audio("987") == "987"


def test_old_database_is_upgraded(tmp_path):
    path = str(tmp_path / "old.db")
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE campaigns (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
            song TEXT NOT NULL DEFAULT '', client TEXT NOT NULL DEFAULT '',
            default_amount INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL);
        INSERT INTO campaigns (name, created_at) VALUES ('Old', '2026-10-01T00:00:00+00:00');
    """)
    conn.close()
    db = dbmod.Database(path)
    assert db.get_campaign(1)["audio_id"] == ""
    db.create_campaign("New", "", "", 0, "42")
    assert db.get_campaign(2)["audio_id"] == "42"


# --- payouts pages --------------------------------------------------------------------

def approve_all(c, n):
    for i in range(1, n + 1):
        c.post("/admin/submissions/%d" % i, auth=ADMIN,
               data={"new_status": "approved", "amount": 600})


def test_payouts_page_and_mark_paid(app_env):
    c, _, db = app_env()
    seed(c, "riya", "aman", "neha")
    approve_all(c, 3)
    c.post("/admin/payouts/limit", auth=ADMIN, data={"daily_limit": 1000})
    assert db.get_daily_limit() == 1000

    r = c.get("/admin/payouts", auth=ADMIN)
    assert r.status_code == 200
    assert 'value="1"' in r.text  # riya is in today's batch
    assert "@aman" in r.text and "Coming up" in r.text

    csv_text = c.get("/admin/payouts/today.csv", auth=ADMIN).text
    assert "riya@okaxis" in csv_text and "aman@okaxis" not in csv_text

    c.post("/admin/payouts/mark-paid", auth=ADMIN, data={"submission_ids": ["1"]})
    assert db.get_submission(1)["status"] == "paid"
    # Today's limit is now partly used, so aman (600) moves to tomorrow.
    csv_text = c.get("/admin/payouts/today.csv", auth=ADMIN).text
    assert "aman@okaxis" not in csv_text


def test_mark_paid_ignores_unapproved(app_env):
    c, _, db = app_env()
    seed(c, "riya")
    c.post("/admin/payouts/mark-paid", auth=ADMIN, data={"submission_ids": ["1"]})
    assert db.get_submission(1)["status"] == "submitted"


def test_limit_must_be_positive(app_env):
    c, _, _ = app_env()
    assert c.post("/admin/payouts/limit", auth=ADMIN, data={"daily_limit": 0}).status_code == 400
    assert c.get("/admin/payouts", follow_redirects=False).status_code == 303


def test_creator_sees_expected_date_and_agent_uses_it(app_env):
    c, _, db = app_env()
    seed(c, "riya", "aman")
    approve_all(c, 2)
    db.set_daily_limit(600)
    tomorrow = today_ist() + timedelta(days=1)

    r = creator_page(c, "aman", "9876543201")
    assert tomorrow.strftime("%a, %d %b") in r.text

    login_creator(c, "aman", "9876543201")
    r = c.post("/query", data={"message": "payment kab aayega?"})
    assert f"expected by {tomorrow:%d %b}" in r.text


def test_digest_mentions_todays_batch(app_env):
    c, _, db = app_env()
    seed(c, "riya", "aman")
    approve_all(c, 2)
    text = build_digest(db, "https://ops.example")
    assert "Today's payment batch: 2 creators (₹1,200)" in text


def test_inr_uses_indian_grouping():
    assert dbmod.inr(119000) == "1,19,000"
    assert dbmod.inr(12345678) == "1,23,45,678"
    assert dbmod.inr(999) == "999"
