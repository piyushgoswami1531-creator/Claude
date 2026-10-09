from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.services.ai import mock
from app.services.ai import review as ai_review
from app.services.auth import COOKIE_NAME, hash_password, login_throttle, verify_password

from .conftest import signup
from .test_api import make_plan


@pytest.fixture(autouse=True)
def _reset_throttle():
    login_throttle._fails.clear()


def test_password_hashing():
    h = hash_password("hunter22-long")
    assert h.startswith("scrypt$") and "hunter22" not in h
    assert verify_password("hunter22-long", h)
    assert not verify_password("hunter22-wrong", h)
    assert hash_password("same-password") != hash_password("same-password")  # salted


def test_everything_requires_login(anon):
    for method, path in [("get", "/api/plans/active"), ("get", "/api/schedule/today"), ("get", "/api/stats"),
                         ("post", "/api/reviews"), ("get", "/api/auth/me")]:
        assert getattr(anon, method)(path).status_code == 401, path
    assert anon.post("/api/syllabus/parse", json={"text": "Unit 1: Joins"}).status_code == 401
    assert anon.get("/api/health").status_code == 200


def test_signup_sets_httponly_cookie(anon):
    r = anon.post("/api/auth/signup", json={"email": "A@Example.com ", "name": " Asha  K ", "password": "longenough1"})
    assert r.status_code == 200
    assert r.json()["email"] == "a@example.com" and r.json()["name"] == "Asha K"
    cookie = r.headers["set-cookie"]
    assert COOKIE_NAME in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower()
    assert anon.get("/api/auth/me").json()["email"] == "a@example.com"


@pytest.mark.parametrize("body", [
    {"email": "nope", "name": "X", "password": "longenough1"},
    {"email": "a@b.co", "name": "X", "password": "short"},
    {"email": "a@b.co", "name": "   ", "password": "longenough1"},
])
def test_signup_validation(anon, body):
    assert anon.post("/api/auth/signup", json=body).status_code == 422


def test_duplicate_email_rejected(anon):
    signup(anon, "dup@example.com")
    r = anon.post("/api/auth/signup", json={"email": "DUP@example.com", "name": "Y", "password": "longenough1"})
    assert r.status_code == 409


def test_login_logout(anon):
    signup(anon, "me@example.com", password="right-password")
    anon.post("/api/auth/logout")
    assert anon.get("/api/auth/me").status_code == 401
    assert anon.post("/api/auth/login", json={"email": "me@example.com", "password": "wrong-password"}).status_code == 401
    assert anon.post("/api/auth/login", json={"email": "ME@example.com", "password": "right-password"}).status_code == 200
    assert anon.get("/api/auth/me").status_code == 200


def test_unknown_email_gives_same_error(anon):
    r = anon.post("/api/auth/login", json={"email": "ghost@example.com", "password": "whatever123"})
    assert r.status_code == 401 and r.json()["detail"] == "Wrong email or password."


def test_login_throttled_after_repeated_failures(anon):
    signup(anon, "t@example.com", password="right-password")
    for _ in range(8):
        anon.post("/api/auth/login", json={"email": "t@example.com", "password": "bad-password"})
    r = anon.post("/api/auth/login", json={"email": "t@example.com", "password": "right-password"})
    assert r.status_code == 429


def test_forged_cookie_rejected(anon):
    anon.cookies.set(COOKIE_NAME, "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.forged")
    assert anon.get("/api/auth/me").status_code == 401


def test_users_cannot_see_each_others_data(clock, anon):
    signup(anon, "alice@example.com")
    plan = make_plan(anon, clock)
    alice_item = anon.get("/api/schedule/today").json()["items"][0]
    alice_topic = plan["subjects"][0]["units"][0]["topics"][0]["id"]

    with TestClient(app) as bob:
        signup(bob, "bob@example.com")
        assert bob.get("/api/plans/active").status_code == 404  # Bob has no plan
        make_plan(bob, clock)
        assert bob.patch(f"/api/schedule/{alice_item['id']}", json={"status": "done"}).status_code == 404
        assert bob.post("/api/quizzes", json={"topic_id": alice_topic}).status_code == 404
        assert bob.post(f"/api/topics/{alice_topic}/complete").status_code == 404
        bob_topics = {t["name"] for s in bob.get("/api/plans/active").json()["subjects"] for u in s["units"] for t in u["topics"]}
        assert bob_topics  # Bob sees his own plan

    # Alice's plan is untouched by Bob creating his
    assert anon.get("/api/plans/active").json()["id"] == plan["id"]


def test_delete_account_removes_everything(client, clock):
    make_plan(client, clock)
    assert client.request("DELETE", "/api/auth/me", json={"password": "wrong-password"}).status_code == 403
    assert client.request("DELETE", "/api/auth/me", json={"password": "correct-horse-9"}).status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", json={"email": "student@example.com", "password": "correct-horse-9"}).status_code == 401


def test_daily_ai_limit(client, clock, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(settings, "ai_mock", False)
    monkeypatch.setattr(settings, "daily_ai_limit", 2)
    monkeypatch.setattr(ai_review, "generate", mock.generate_review)  # no real API call

    monkeypatch.setattr(settings, "ai_mock", True)
    make_plan(client, clock)  # demo-mode parse is free
    monkeypatch.setattr(settings, "ai_mock", False)

    assert client.post("/api/reviews").status_code == 200
    assert client.post("/api/reviews").status_code == 200
    r = client.post("/api/reviews")
    assert r.status_code == 429 and "2 AI requests" in r.json()["detail"]
    assert client.get("/api/auth/me").json()["ai"] == {"mode": "live", "limit": 2, "used_today": 2}

    clock.today += timedelta(days=1)  # resets the next day
    assert client.post("/api/reviews").status_code == 200
