from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app import db as dbmod
from app import validation
from app.main import create_app

ADMIN = ("admin", "secret")
REEL = "https://www.instagram.com/reel/Cabc123_-x/"


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for var in ("ANTHROPIC_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "PUBLIC_BASE_URL"):
        monkeypatch.delenv(var, raising=False)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "secret")
    app = create_app(str(tmp_path / "test.db"))
    return TestClient(app)


def make_campaign(client, name="Song Launch", amount=500):
    r = client.post(
        "/admin/campaigns",
        data={"name": name, "song": "Track", "client": "Label", "default_amount": amount},
        auth=ADMIN,
        follow_redirects=False,
    )
    assert r.status_code == 303
    return 1


def submit(client, campaign_id=1, **overrides):
    data = {
        "campaign_id": campaign_id,
        "ig_handle": "@Creator.One",
        "whatsapp": "+91 98765 43210",
        "upi_id": "creator@okaxis",
        "upi_confirm": "creator@okaxis",
        "reel_url": REEL,
    }
    data.update(overrides)
    return client.post("/submit", data=data)


# --- validation -------------------------------------------------------------

def test_clean_whatsapp_variants():
    for raw in ["9876543210", "+91 98765 43210", "09876543210", "91-9876543210"]:
        assert validation.clean_whatsapp(raw) == "9876543210"
    for bad in ["12345", "5876543210", "abcdefghij"]:
        with pytest.raises(ValueError):
            validation.clean_whatsapp(bad)


def test_clean_upi_requires_match():
    assert validation.clean_upi("Name@OkAxis", "name@okaxis") == "name@okaxis"
    with pytest.raises(ValueError):
        validation.clean_upi("name@okaxis", "name@oksbi")
    with pytest.raises(ValueError):
        validation.clean_upi("not-a-upi", "not-a-upi")


def test_clean_reel_url_strips_tracking():
    assert validation.clean_reel_url(REEL + "?igsh=xyz") == REEL
    with pytest.raises(ValueError):
        validation.clean_reel_url("https://youtube.com/shorts/abc")


# --- creator flow -------------------------------------------------------------

def test_submit_and_check_status(client):
    make_campaign(client)
    r = submit(client)
    assert r.status_code == 200
    assert "@creator.one" in r.text

    r = client.post("/status", data={"ig_handle": "creator.one", "whatsapp": "9876543210"})
    assert r.status_code == 200
    assert "Song Launch" in r.text
    assert "₹500" in r.text


def test_status_needs_matching_phone(client):
    make_campaign(client)
    submit(client)
    r = client.post("/status", data={"ig_handle": "creator.one", "whatsapp": "9999999999"})
    assert "No submissions found" in r.text
    assert "Song Launch" not in r.text


def test_duplicate_submission_rejected(client):
    make_campaign(client)
    assert submit(client).status_code == 200
    r = submit(client)
    assert r.status_code == 400
    assert "already submitted" in r.text


def test_invalid_submission_shows_errors(client):
    make_campaign(client)
    r = submit(client, upi_confirm="other@okaxis", reel_url="nope")
    assert r.status_code == 400
    assert "don&#39;t match" in r.text or "don't match" in r.text
    assert "reel link" in r.text


def test_closed_campaign_rejects_submissions(client):
    make_campaign(client)
    client.post("/admin/campaigns/1/toggle", auth=ADMIN)
    r = submit(client)
    assert r.status_code == 400


# --- admin --------------------------------------------------------------------

def test_admin_requires_auth(client):
    assert client.get("/admin").status_code == 401
    assert client.get("/admin", auth=("admin", "wrong")).status_code == 401
    assert client.get("/admin", auth=ADMIN).status_code == 200


def test_admin_disabled_without_password(tmp_path, monkeypatch):
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    c = TestClient(create_app(str(tmp_path / "t.db")))
    assert c.get("/admin", auth=ADMIN).status_code == 503


def test_mark_paid_updates_creator_view(client):
    make_campaign(client)
    submit(client)
    r = client.post(
        "/admin/submissions/1",
        data={"new_status": "paid", "amount": 750, "note": "Sent via GPay"},
        auth=ADMIN,
        follow_redirects=False,
    )
    assert r.status_code == 303
    r = client.post("/status", data={"ig_handle": "creator.one", "whatsapp": "9876543210"})
    assert "Paid!" in r.text
    assert "₹750" in r.text
    assert "Sent via GPay" in r.text


def test_update_redirect_stays_in_admin(client):
    make_campaign(client)
    submit(client)
    r = client.post(
        "/admin/submissions/1",
        data={"new_status": "approved", "amount": 500, "next_url": "https://evil.example"},
        auth=ADMIN,
        follow_redirects=False,
    )
    assert r.headers["location"] == "/admin"


def test_stats_and_overdue(client, tmp_path):
    make_campaign(client, amount=400)
    submit(client)
    submit(client, ig_handle="second", whatsapp="9123456789")
    # Push the first submission 3 days into the past.
    database = dbmod.Database(str(tmp_path / "test.db"))
    old = dbmod.to_iso(dbmod.now_utc() - timedelta(days=3))
    with database.connect() as conn:
        conn.execute("UPDATE submissions SET submitted_at = ? WHERE id = 1", (old,))
    stats = database.stats()
    assert stats == {
        "pending": 2, "pending_amount": 800, "overdue": 1, "issues": 0, "open_tickets": 0,
    }


def test_export_csv_filters_and_escapes(client):
    make_campaign(client)
    submit(client)
    client.post(
        "/admin/submissions/1",
        data={"new_status": "approved", "amount": 500, "note": "=HYPERLINK(\"x\")"},
        auth=ADMIN,
    )
    r = client.get("/admin/export.csv?status_filter=approved", auth=ADMIN)
    assert r.status_code == 200
    assert "creator@okaxis" in r.text
    assert "'=HYPERLINK" in r.text
    r = client.get("/admin/export.csv?status_filter=paid", auth=ADMIN)
    assert "creator@okaxis" not in r.text
