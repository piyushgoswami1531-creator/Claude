import pytest
from fastapi.testclient import TestClient

from app import auth
from app.agent import QueryAgent
from app.main import create_app
from tests.helpers import PIN, creator_page, login_creator, submit_reel

REEL = "https://www.instagram.com/reel/AbC123/"


class SilentNotifier:
    configured = False

    def send(self, text):
        return False


@pytest.fixture(autouse=True)
def env(monkeypatch):
    for var in ("ANTHROPIC_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "APIFY_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("ADMIN_PASSWORD", "owner-password")
    monkeypatch.setenv("SECRET_KEY", "test-secret")


@pytest.fixture
def c(tmp_path):
    app = create_app(str(tmp_path / "a.db"), agent=QueryAgent(client=None),
                     notifier=SilentNotifier())
    client = TestClient(app)
    client.app_db = app.state.ctx.db
    return client


def host_login(c, username="admin", password="owner-password", next="/admin"):
    c.cookies.clear()
    return c.post("/login", data={"username": username, "password": password, "next": next},
                  follow_redirects=False)


def seed_campaign(c):
    host_login(c)
    c.post("/admin/campaigns", data={"name": "Monsoon", "default_amount": 500})
    c.cookies.clear()


def reel(c, handle, phone, pin=PIN, confirm=PIN, **extra):
    return submit_reel(c, {"campaign_id": 1, "ig_handle": handle, "whatsapp": phone,
                           "upi_id": f"{handle}@okaxis", "upi_confirm": f"{handle}@okaxis",
                           "reel_url": REEL, "pin": pin, "pin_confirm": confirm, **extra})


# --- hosts --------------------------------------------------------------------------

def test_host_login_flow(c):
    assert c.get("/admin", follow_redirects=False).headers["location"].startswith("/login")
    r = host_login(c, password="wrong")
    assert r.status_code == 400 and "Wrong username or password" in r.text
    r = host_login(c)
    assert r.status_code == 303 and r.headers["location"] == "/admin"
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert c.get("/admin").status_code == 200
    c.post("/logout")
    assert c.get("/admin", follow_redirects=False).status_code == 303


def test_login_redirect_stays_on_site(c):
    assert host_login(c, next="https://evil.example").headers["location"] == "/admin"
    assert host_login(c, next="/admin/payouts").headers["location"] == "/admin/payouts"


def test_host_lockout_after_repeated_failures(c):
    for _ in range(auth.MAX_FAILURES):
        host_login(c, password="nope")
    r = host_login(c)  # correct password, but locked
    assert r.status_code == 400 and "Too many" in r.text


def test_tampered_session_is_rejected(c):
    host_login(c)
    token = c.cookies.get(auth.COOKIE_NAME)
    c.cookies.clear()
    payload, sig = token.rsplit(".", 1)
    c.cookies.set(auth.COOKIE_NAME, payload + "." + "0" * len(sig))
    assert c.get("/admin", follow_redirects=False).status_code == 303


def test_team_members(c):
    host_login(c)
    r = c.post("/admin/team", data={"username": "Riya.Ops", "name": "Riya", "password": "short"})
    assert r.status_code == 400
    r = c.post("/admin/team", data={"username": "riya.ops", "name": "Riya",
                                    "password": "long-enough-pw"}, follow_redirects=False)
    assert r.status_code == 303
    assert c.app_db.get_host("riya.ops")["pw_hash"].startswith("pbkdf2$")

    # The new member can log in and see everything, but can't manage the team.
    assert host_login(c, "riya.ops", "long-enough-pw").status_code == 303
    assert c.get("/admin/campaigns").status_code == 200
    r = c.post("/admin/team", data={"username": "x.y.z", "password": "long-enough-pw"})
    assert r.status_code == 403
    r = c.post("/admin/team/password", data={"current": "long-enough-pw",
                                             "new": "another-long-pw"}, follow_redirects=False)
    assert r.status_code == 303
    assert host_login(c, "riya.ops", "another-long-pw").status_code == 303

    # Removing them ends their access immediately, even with a live session.
    member_cookie = c.cookies.get(auth.COOKIE_NAME)
    host_login(c)
    c.post("/admin/team/riya.ops/delete")
    c.cookies.clear()
    c.cookies.set(auth.COOKIE_NAME, member_cookie)
    assert c.get("/admin", follow_redirects=False).status_code == 303


# --- creators -------------------------------------------------------------------------

def test_creator_sees_only_their_own_data(c):
    seed_campaign(c)
    assert reel(c, "riya", "9876543210").status_code == 200
    assert reel(c, "aman", "9123456789", pin="5555", confirm="5555").status_code == 200

    page = creator_page(c, "riya", "9876543210").text
    assert "@riya" in page and "riya@okaxis" not in page  # own dashboard, no UPI shown
    assert "aman" not in page

    assert "Wrong PIN" in creator_page(c, "riya", "9876543210", pin="5555").text
    assert "aman" in creator_page(c, "aman", "9123456789", pin="5555").text


def test_creator_cannot_reach_host_pages(c):
    seed_campaign(c)
    reel(c, "riya", "9876543210")
    login_creator(c, "riya", "9876543210")
    assert c.get("/admin", follow_redirects=False).status_code == 303
    assert c.post("/admin/payouts/limit", data={"daily_limit": 1}).status_code == 401


def test_new_creator_must_confirm_pin(c):
    seed_campaign(c)
    r = reel(c, "riya", "9876543210", pin="1234", confirm="9999")
    assert r.status_code == 400 and "don" in r.text
    r = reel(c, "riya", "9876543210", pin="12", confirm="12")
    assert r.status_code == 400 and "4 to 6 digits" in r.text


def test_returning_creator_needs_their_pin_to_submit(c):
    seed_campaign(c)
    host_login(c)
    c.post("/admin/campaigns", data={"name": "Second", "default_amount": 300})
    c.cookies.clear()
    reel(c, "riya", "9876543210")
    # Someone else using riya's handle and number can't submit without her PIN.
    r = reel(c, "riya", "9876543210", pin="0000", confirm="0000", campaign_id=2)
    assert r.status_code == 400 and "Wrong PIN" in r.text
    assert reel(c, "riya", "9876543210", campaign_id=2).status_code == 200


def test_logged_in_creator_submits_as_themselves(c):
    seed_campaign(c)
    host_login(c)
    c.post("/admin/campaigns", data={"name": "Second", "default_amount": 300})
    c.cookies.clear()
    reel(c, "riya", "9876543210")
    login_creator(c, "riya", "9876543210")
    # Even if the form claims another identity, the session decides.
    r = c.post("/submit", data={"campaign_id": 2, "ig_handle": "aman", "whatsapp": "9123456789",
                                "upi_id": "riya2@okaxis", "upi_confirm": "riya2@okaxis", "reel_url": REEL})
    assert r.status_code == 200
    assert c.app_db.get_submission(2)["ig_handle"] == "riya"


def test_creator_pin_lockout(c):
    seed_campaign(c)
    reel(c, "riya", "9876543210")
    for _ in range(auth.MAX_FAILURES):
        creator_page(c, "riya", "9876543210", pin="0000")
    assert "Too many" in creator_page(c, "riya", "9876543210").text


def test_existing_creator_without_pin_sets_one(c):
    seed_campaign(c)
    c.app_db.add_submission(1, "old.timer", "9000000001", "old@okaxis", REEL)  # pre-PIN data
    r = login_creator(c, "old.timer", "9000000001", pin="0")
    assert "Create your PIN" in r.text
    r = c.post("/me/login", data={"ig_handle": "old.timer", "whatsapp": "9000000001",
                                  "pin": "4321", "pin_confirm": "4321"})
    assert "@old.timer" in r.text and "Monsoon" in r.text
    assert "Monsoon" in creator_page(c, "old.timer", "9000000001", pin="4321").text
    # Unknown creators can't create an account out of thin air.
    assert "No reels found" in login_creator(c, "stranger", "9000000002").text


def test_public_pages_render(c):
    seed_campaign(c)
    for path in ("/", "/submit", "/me", "/query", "/login"):
        assert c.get(path).status_code == 200, path


def test_host_resets_forgotten_pin(c):
    seed_campaign(c)
    reel(c, "riya", "9876543210")
    for _ in range(auth.MAX_FAILURES):  # forgot it, and got locked out
        creator_page(c, "riya", "9876543210", pin="0000")
    host_login(c)
    r = c.post("/admin/submissions/1/reset-pin", follow_redirects=False)
    assert r.headers["location"] == "/admin?pin_reset=riya"
    c.cookies.clear()
    assert "Create your PIN" in login_creator(c, "riya", "9876543210", pin="0").text
    c.post("/me/login", data={"ig_handle": "riya", "whatsapp": "9876543210",
                              "pin": "2468", "pin_confirm": "2468"})
    assert "Monsoon" in creator_page(c, "riya", "9876543210", pin="2468").text
    # Creators can't reset PINs.
    login_creator(c, "riya", "9876543210", pin="2468")
    assert c.post("/admin/submissions/1/reset-pin").status_code == 401
