import os
import sys
import tempfile
from datetime import date
from pathlib import Path

import pytest

# Isolated DB + offline AI before the app is imported.
_tmp = tempfile.mkdtemp()
# Set TEST_DATABASE_URL=postgresql://... to run the suite against Postgres.
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{Path(_tmp) / 'test.db'}"
os.environ["AI_MOCK"] = "true"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.deps import get_today  # noqa: E402
from app.main import app  # noqa: E402

SYLLABUS = """Subject: DBMS
Unit 1: Introduction - Data models, ER diagrams, Keys
Unit 2: Normalization - 1NF, 2NF, 3NF, BCNF
Unit 3: SQL - Joins, Subqueries, Transactions and concurrency

Subject: Operating Systems
Unit 1: Processes - Process states, Scheduling algorithms
Unit 2: Memory - Paging, Segmentation, Virtual memory
"""


class Clock:
    def __init__(self, today: date):
        self.today = today


@pytest.fixture
def clock():
    return Clock(date(2026, 10, 1))


def signup(c: TestClient, email: str = "student@example.com", name: str = "Test Student", password: str = "correct-horse-9"):
    r = c.post("/api/auth/signup", json={"email": email, "name": name, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def anon(clock):
    """A client with a fresh database and no account."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    app.dependency_overrides[get_today] = lambda: clock.today
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def client(anon):
    """A logged-in client."""
    signup(anon)
    return anon
