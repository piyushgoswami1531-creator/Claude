import os
import sys
import tempfile
from datetime import date
from pathlib import Path

import pytest

# Isolated DB + offline AI before the app is imported.
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp) / 'test.db'}"
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


@pytest.fixture
def client(clock):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    app.dependency_overrides[get_today] = lambda: clock.today
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
