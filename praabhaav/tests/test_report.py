import pytest
from fastapi.testclient import TestClient

from app.agent import QueryAgent
from app.main import create_app


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
def c(tmp_path):
    app = create_app(str(tmp_path / "r.db"), agent=QueryAgent(client=None),
                     notifier=SilentNotifier())
    client = TestClient(app)
    db = app.state.ctx.db
    client.post("/login", data={"username": "admin", "password": "owner-password"})
    client.post("/admin/campaigns", data={"name": "Monsoon Launch", "song": "Baarish",
                                          "client": "XYZ Records"})
    rows = [  # handle, followers, price, reel, views, likes, comments, note
        ("riya", 152000, 3333, "https://www.instagram.com/reel/AbC1/", 412000, 31200, 410, "pay extra"),
        ("neha", 231000, 4444, "https://www.instagram.com/reel/AbC2/", 640500, 52000, 980, ""),
        ("tanya", 9400, 777, "", None, None, None, "not posted yet"),
    ]
    for h, f, p, reel, v, l, cm, note in rows:
        rid = db.add_roster_row(1, handle=h, profile_url=f"https://www.instagram.com/{h}/",
                                followers=f, price=p, reel_url=reel, notes=note)
        if v:
            db.set_roster_stats(rid, views=v, likes=l, comments=cm)
    client.db = db
    return client


def enable(c, action="enable"):
    c.post("/admin/campaigns/1/report", data={"action": action})
    token = c.db.get_campaign(1)["report_token"]
    return f"/r/{token}" if token else None


def test_report_is_off_until_enabled(c):
    assert c.db.get_campaign(1)["report_token"] == ""
    assert "Create client report link" in c.get("/admin/campaigns/1").text
    assert c.get("/r/").status_code == 404
    assert c.get("/r/anything").status_code == 404


def test_client_sees_performance_not_money(c):
    link = enable(c)
    assert len(link) > 20
    c.cookies.clear()  # the client isn't logged in
    r = c.get(link)
    assert r.status_code == 200
    page = r.text
    assert "Monsoon Launch" in page and "XYZ Records" in page
    assert "1.1M" in page            # total views 412K + 640.5K
    assert "@neha" in page and "@riya" in page
    assert page.index("@neha") < page.index("@riya")  # ranked by views
    assert "@tanya" not in page      # no live reel yet: not listed
    # Internal numbers never leak.
    for secret in ("3333", "3,333", "4444", "4,444", "777", "₹", "pay extra", "not posted yet"):
        assert secret not in page, secret
    assert r.headers["x-robots-tag"] == "noindex, nofollow"
    assert r.headers["referrer-policy"] == "no-referrer"


def test_report_csv_has_only_public_columns(c):
    link = enable(c)
    c.cookies.clear()
    r = c.get(link + "/report.csv")
    assert r.status_code == 200 and "monsoon-launch-report.csv" in r.headers["content-disposition"]
    header, *rows = r.text.strip().splitlines()
    assert header == "handle,profile_url,followers,reel_url,views,likes,comments"
    assert rows[0].startswith("neha,") and len(rows) == 2
    assert "3333" not in r.text and "4444" not in r.text and "pay extra" not in r.text


def test_new_link_revokes_old_and_off_disables(c):
    old = enable(c)
    new = enable(c, "regenerate")
    assert new != old
    assert c.get(old).status_code == 404 and c.get(new).status_code == 200
    assert enable(c, "disable") is None
    assert c.get(new).status_code == 404
    assert c.get(new + "/report.csv").status_code == 404


def test_only_hosts_manage_the_link(c):
    c.cookies.clear()
    r = c.post("/admin/campaigns/1/report", data={"action": "enable"})
    assert r.status_code == 401
    assert c.db.get_campaign(1)["report_token"] == ""


def test_host_sees_link_on_campaign_page(c):
    link = enable(c)
    page = c.get("/admin/campaigns/1").text
    assert link in page and "New link" in page and "Turn off" in page


def test_empty_campaign_report(c):
    c.post("/admin/campaigns", data={"name": "Fresh"})
    c.post("/admin/campaigns/2/report", data={"action": "enable"})
    token = c.db.get_campaign(2)["report_token"]
    c.cookies.clear()
    assert "Reels are going live soon" in c.get(f"/r/{token}").text


def test_broken_reels_stay_off_the_client_report(c):
    rid = c.db.add_roster_row(1, handle="karan", reel_url="https://www.instagram.com/reel/Gone/")
    c.db.set_roster_stats(rid, error="Reel not found (deleted or private?)")
    link = enable(c)
    c.cookies.clear()
    page = c.get(link).text
    assert "@karan" not in page and "deleted" not in page
    assert "across 2 live reels" in page
    # Once the team fixes the link and views come in, it appears.
    c.db.set_roster_stats(rid, views=5000)
    assert "@karan" in c.get(link).text
