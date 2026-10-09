import json
import re
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import db as dbmod
from app.agent import ESCALATION_LINE, QueryAgent
from app.digest import build_digest
from app.main import create_app

ADMIN = ("admin", "secret")
REEL = "https://www.instagram.com/reel/Cabc123/"


class FakeMessages:
    def __init__(self, payload=None, stop_reason="end_turn", error=None):
        self.payload = payload
        self.stop_reason = stop_reason
        self.error = error
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        text = json.dumps(self.payload) if self.payload is not None else ""
        return SimpleNamespace(
            stop_reason=self.stop_reason,
            content=[SimpleNamespace(type="text", text=text)],
        )


class FakeClaude:
    def __init__(self, **kwargs):
        self.messages = FakeMessages(**kwargs)
        self.beta = SimpleNamespace(messages=self.messages)


class FakeNotifier:
    configured = True

    def __init__(self):
        self.sent = []

    def send(self, text):
        self.sent.append(text)
        return True


def decision(**overrides):
    data = {
        "category": "payment_status", "priority": "low", "escalate": False,
        "reply": "Your payment is in the queue.", "team_summary": "Asked about payment.",
    }
    data.update(overrides)
    return data


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for var in ("ANTHROPIC_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "PUBLIC_BASE_URL"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("ADMIN_PASSWORD", "secret")


@pytest.fixture
def make_client(tmp_path):
    """Build an app with an optional fake Claude client; returns (client, notifier, db)."""
    def _make(claude=None):
        notifier = FakeNotifier()
        path = str(tmp_path / "q.db")
        app = create_app(path, agent=QueryAgent(client=claude), notifier=notifier)
        c = TestClient(app)
        c.post("/admin/campaigns", auth=ADMIN,
               data={"name": "Monsoon", "song": "Baarish", "default_amount": 500})
        c.post("/submit", data={
            "campaign_id": 1, "ig_handle": "riya", "whatsapp": "9876543210",
            "upi_id": "riya@okaxis", "upi_confirm": "riya@okaxis", "reel_url": REEL,
        })
        c.post("/submit", data={
            "campaign_id": 1, "ig_handle": "aman", "whatsapp": "9123456789",
            "upi_id": "aman@ybl", "upi_confirm": "aman@ybl", "reel_url": REEL,
        })
        return c, notifier, dbmod.Database(path)
    return _make


def ask(c, message, role="creator", name="riya", whatsapp="9876543210", campaign_id=""):
    return c.post("/query", data={
        "role": role, "name": name, "whatsapp": whatsapp,
        "campaign_id": campaign_id, "message": message,
    })


def ticket_link(html):
    return re.search(r'href="(/tickets/\d+\?token=[^"]+)"', html).group(1)


# --- rules mode (no API key) -------------------------------------------------------

def test_rules_answer_payment_status_from_tracker(make_client):
    c, notifier, db = make_client()
    r = ask(c, "Mera payment kab aayega?")
    assert r.status_code == 200
    assert "Monsoon: ₹500, status &#39;submitted&#39;" in r.text
    t = db.get_ticket(1)
    assert t["status"] == "answered" and t["handled_by"] == "rules"
    assert notifier.sent == []


def test_rules_hinglish_payment_question_mentioning_reel(make_client):
    c, notifier, db = make_client()
    ask(c, "Payment kab tak aayega? Reel 2 din pehle daali thi")
    t = db.get_ticket(1)
    assert t["category"] == "payment_status" and t["status"] == "answered"


def test_rules_escalate_upi_change(make_client):
    c, notifier, db = make_client()
    ask(c, "I entered the wrong UPI, please send to riya@oksbi")
    t = db.get_ticket(1)
    assert t["category"] == "upi_change"
    assert t["status"] == "escalated"
    assert len(notifier.sent) == 1
    assert "@riya" in notifier.sent[0] and "upi change" in notifier.sent[0]


def test_unknown_creator_payment_question_escalates(make_client):
    c, notifier, db = make_client()
    ask(c, "where is my payment", name="nobody")
    assert db.get_ticket(1)["status"] == "escalated"


# --- Claude mode ----------------------------------------------------------------------

def test_claude_request_shape_and_privacy(make_client):
    claude = FakeClaude(payload=decision())
    c, notifier, db = make_client(claude)
    ask(c, "payment status?")
    kwargs = claude.messages.calls[0]
    assert kwargs["model"] == "claude-opus-5-5"
    assert kwargs["fallbacks"] == "default"
    assert kwargs["output_config"]["format"]["type"] == "json_schema"
    content = kwargs["messages"][0]["content"]
    assert "Monsoon" in content and "₹500" in content
    # Another creator's data never reaches the model.
    assert "aman" not in content
    t = db.get_ticket(1)
    assert t["handled_by"] == "claude" and t["status"] == "answered"
    assert notifier.sent == []


def test_policy_overrides_model_on_dispute(make_client):
    claude = FakeClaude(payload=decision(category="amount_dispute", escalate=False))
    c, notifier, db = make_client(claude)
    r = ask(c, "I got only 300 instead of 500")
    t = db.get_ticket(1)
    assert t["status"] == "escalated" and t["priority"] == "high"
    assert ESCALATION_LINE in t["ai_reply"]
    assert len(notifier.sent) == 1
    assert "with team" in r.text


def test_overdue_payment_always_escalates_high(make_client):
    claude = FakeClaude(payload=decision())
    c, notifier, db = make_client(claude)
    old = dbmod.to_iso(dbmod.now_utc() - timedelta(days=3))
    with db.connect() as conn:
        conn.execute("UPDATE submissions SET submitted_at = ? WHERE ig_handle = 'riya'", (old,))
    ask(c, "still not paid")
    assert "OVERDUE" in claude.messages.calls[0]["messages"][0]["content"]
    t = db.get_ticket(1)
    assert t["status"] == "escalated" and t["priority"] == "high"


def test_client_queries_escalate_without_creator_data(make_client):
    claude = FakeClaude(payload=decision(category="client_request", escalate=False))
    c, notifier, db = make_client(claude)
    ask(c, "How many reels are live for our song?", role="client", name="XYZ Records",
        campaign_id="1")
    content = claude.messages.calls[0]["messages"][0]["content"]
    assert "Monsoon" in content
    assert "riya" not in content and "upi" not in content.lower()
    t = db.get_ticket(1)
    assert t["role"] == "client" and t["status"] == "escalated"
    assert len(notifier.sent) == 1


@pytest.mark.parametrize("claude", [
    FakeClaude(error=RuntimeError("network down")),
    FakeClaude(payload=None, stop_reason="refusal"),
    FakeClaude(payload={"category": "payment_status"}),  # missing fields
])
def test_claude_failure_falls_back_to_rules(make_client, claude):
    c, notifier, db = make_client(claude)
    r = ask(c, "payment kab aayega")
    assert r.status_code == 200
    assert db.get_ticket(1)["handled_by"] == "rules"


# --- pages ----------------------------------------------------------------------------

def test_ticket_page_needs_token(make_client):
    c, _, _ = make_client()
    r = ask(c, "wrong upi entered")
    link = ticket_link(r.text)
    assert c.get(link).status_code == 200
    assert c.get("/tickets/1?token=guess").status_code == 404
    assert c.get("/tickets/1").status_code == 404


def test_team_reply_reaches_creator(make_client):
    c, _, _ = make_client()
    r = ask(c, "wrong upi entered")
    link = ticket_link(r.text)
    assert c.get("/admin/tickets", auth=ADMIN).status_code == 200
    r = c.post("/admin/tickets/1", auth=ADMIN, follow_redirects=False,
               data={"new_status": "resolved", "team_reply": "Updated your UPI, paying today."})
    assert r.status_code == 303
    assert "Updated your UPI" in c.get(link).text
    r = c.post("/status", data={"ig_handle": "riya", "whatsapp": "9876543210"})
    assert "Updated your UPI" in r.text
    # A different number sees nothing.
    r = c.post("/status", data={"ig_handle": "riya", "whatsapp": "9000000000"})
    assert "Updated your UPI" not in r.text


def test_admin_tickets_requires_auth(make_client):
    c, _, _ = make_client()
    assert c.get("/admin/tickets").status_code == 401
    assert c.post("/admin/tickets/1", data={"new_status": "resolved"}).status_code == 401


def test_query_validation(make_client):
    c, _, db = make_client()
    r = ask(c, "hi")
    assert r.status_code == 400
    r = ask(c, "x" * 2001)
    assert r.status_code == 400
    r = ask(c, "valid question here", role="hacker")
    assert r.status_code == 400
    assert db.list_tickets() == []


def test_admin_can_change_upi(make_client):
    c, _, db = make_client()
    c.post("/admin/submissions/1", auth=ADMIN,
           data={"new_status": "approved", "amount": 500, "upi_id": "Riya@OkSBI"})
    assert db.get_submission(1)["upi_id"] == "riya@oksbi"
    r = c.post("/admin/submissions/1", auth=ADMIN,
               data={"new_status": "approved", "amount": 500, "upi_id": "bad"})
    assert r.status_code == 400


def test_digest_lists_overdue_and_open_queries(make_client):
    c, _, db = make_client()
    old = dbmod.to_iso(dbmod.now_utc() - timedelta(days=4))
    with db.connect() as conn:
        conn.execute("UPDATE submissions SET submitted_at = ? WHERE ig_handle = 'aman'", (old,))
    ask(c, "wrong upi entered")
    text = build_digest(db, "https://ops.example")
    assert "Waiting for payment: 2 (₹1,000)" in text
    assert "@aman · Monsoon · ₹500 · 4d" in text
    assert "Open escalated queries: 1" in text
    assert "https://ops.example/admin" in text


def test_send_digest_endpoint(make_client):
    c, notifier, _ = make_client()
    r = c.post("/admin/digest", auth=ADMIN)
    assert r.status_code == 200
    assert "Sent to Telegram" in r.text
    assert "daily summary" in notifier.sent[-1]
