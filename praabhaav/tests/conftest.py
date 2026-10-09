"""Run the whole suite against Postgres too:

    TEST_DATABASE_URL=postgresql://user:pw@localhost/db python -m pytest -q

Each SQLite path a test uses (under pytest's tmp dir) becomes its own Postgres
schema, wiped at first use in that test. Tests marked ``sqlite_only`` are skipped.
"""

import hashlib
import os

import pytest

PG_URL = os.environ.get("TEST_DATABASE_URL")


def pytest_configure(config):
    config.addinivalue_line("markers", "sqlite_only: test is about SQLite files specifically")
    config.addinivalue_line("markers", "own_database: test opens its own databases; don't redirect")


@pytest.fixture(autouse=True)
def _postgres_backend(request, monkeypatch, tmp_path_factory):
    if not PG_URL:
        yield
        return
    if request.node.get_closest_marker("sqlite_only"):
        pytest.skip("SQLite-specific test")
    if request.node.get_closest_marker("own_database"):
        yield
        return

    import psycopg

    from app import db as dbmod
    from app.storage import is_postgres

    base = str(tmp_path_factory.getbasetemp())
    original_init = dbmod.Database.__init__
    fresh: set[str] = set()
    opened = []

    def init(self, target, schema=None):
        # Only test databases are redirected; e.g. backup files stay real SQLite.
        if not is_postgres(target) and str(target).startswith(base):
            schema = "t_" + hashlib.md5(str(target).encode()).hexdigest()[:16]
            if schema not in fresh:
                with psycopg.connect(PG_URL, autocommit=True) as conn:
                    conn.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
                fresh.add(schema)
            target = PG_URL
        original_init(self, target, schema)
        opened.append(self)

    monkeypatch.setattr(dbmod.Database, "__init__", init)
    yield
    for database in opened:
        database.close()
