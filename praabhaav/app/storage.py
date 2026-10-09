"""Database engines: SQLite (local file) or Postgres (e.g. Neon's free plan).

`db.py` writes portable SQL with `?` placeholders; this module runs it on
whichever engine the target string selects:

- a file path such as ``praabhaav.db``      -> SQLite
- ``postgres://`` or ``postgresql://`` URL  -> Postgres

Both engines hand back rows that support ``row["column"]`` and ``row[0]``, so
callers and templates don't care which one is in use.
"""

import re
import sqlite3
import threading
from contextlib import contextmanager

POSTGRES_PREFIXES = ("postgres://", "postgresql://")

try:  # Postgres support is optional for local development and tests.
    import psycopg
    from psycopg_pool import ConnectionPool

    INTEGRITY_ERRORS: tuple = (sqlite3.IntegrityError, psycopg.IntegrityError)
except ImportError:  # pragma: no cover - only without the postgres extras
    psycopg = None
    ConnectionPool = None
    INTEGRITY_ERRORS = (sqlite3.IntegrityError,)


def is_postgres(target: str) -> bool:
    return isinstance(target, str) and target.startswith(POSTGRES_PREFIXES)


# --- SQLite -------------------------------------------------------------------------------

class SqliteConn:
    def __init__(self, raw: sqlite3.Connection):
        self.raw = raw

    def execute(self, sql: str, params=()):
        return self.raw.execute(sql, params)

    def insert(self, sql: str, params=()) -> int:
        return self.raw.execute(sql, params).lastrowid

    def executescript(self, script: str) -> None:
        self.raw.executescript(script)

    def columns(self, table: str) -> set[str]:
        return {r["name"] for r in self.raw.execute(f"PRAGMA table_info({table})")}


class SqliteEngine:
    kind = "sqlite"

    def __init__(self, path: str):
        self.path = path

    @contextmanager
    def connect(self):
        raw = sqlite3.connect(self.path)
        raw.row_factory = sqlite3.Row
        raw.execute("PRAGMA foreign_keys = ON")
        try:
            yield SqliteConn(raw)
            raw.commit()
        finally:
            raw.close()

    def close(self) -> None:
        pass


# --- Postgres -----------------------------------------------------------------------------

class Row:
    """Read-only row: row["name"], row[0], dict(row), iteration over values."""

    __slots__ = ("_index", "_values")

    def __init__(self, index: dict, values):
        self._index = index
        self._values = tuple(values)

    def __getitem__(self, key):
        if isinstance(key, (int, slice)):
            return self._values[key]
        return self._values[self._index[key]]

    def keys(self):
        return list(self._index)

    def __iter__(self):
        return iter(self._values)

    def __len__(self):
        return len(self._values)

    def __repr__(self):
        return f"Row({dict(zip(self._index, self._values))!r})"


def _row_factory(cursor):
    index = {col.name: i for i, col in enumerate(cursor.description or [])}
    return lambda values: Row(index, values)


def _pg_sql(sql: str, has_params: bool) -> str:
    # Portable SQL uses '?' placeholders; psycopg uses '%s' (and '%%' for a literal %).
    return sql.replace("%", "%%").replace("?", "%s") if has_params else sql


def _pg_ddl(statement: str) -> str:
    return statement.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")


def _split_script(script: str) -> list[str]:
    without_comments = re.sub(r"--[^\n]*", "", script)
    return [s.strip() for s in without_comments.split(";") if s.strip()]


class PgConn:
    def __init__(self, raw):
        self.raw = raw

    def execute(self, sql: str, params=()):
        cur = self.raw.cursor(row_factory=_row_factory)
        cur.execute(_pg_sql(sql, bool(params)), tuple(params) if params else None)
        return cur

    def insert(self, sql: str, params=()) -> int:
        return self.execute(sql + " RETURNING id", params).fetchone()[0]

    def executescript(self, script: str) -> None:
        for statement in _split_script(script):
            self.raw.execute(_pg_ddl(statement))

    def columns(self, table: str) -> set[str]:
        rows = self.execute(
            "SELECT column_name FROM information_schema.columns"
            " WHERE table_name = ? AND table_schema = current_schema()",
            (table,),
        ).fetchall()
        return {r[0] for r in rows}


_pools: dict = {}
_pools_lock = threading.Lock()


class PostgresEngine:
    """Pooled connections. min_size=0 and a short max_idle let idle connections
    close, so a scale-to-zero database (Neon) can suspend and save free compute."""

    kind = "postgres"

    def __init__(self, url: str, schema: str | None = None):
        if psycopg is None:
            raise RuntimeError("Postgres URL given but psycopg isn't installed: "
                               "pip install 'psycopg[binary]' psycopg-pool")
        self.url = url
        self.schema = schema
        key = (url, schema)
        with _pools_lock:
            pool = _pools.get(key)
            if pool is None:
                kwargs = {"prepare_threshold": None}  # safe behind PgBouncer (Neon pooler)
                if schema:
                    self._ensure_schema(url, schema)
                    kwargs["options"] = f"-c search_path={schema}"
                # The pool drops one idle connection per max_idle window, so a short
                # window and a small cap let all connections close within ~1-2 min.
                pool = ConnectionPool(
                    url, min_size=0, max_size=3, max_idle=30, timeout=30,
                    kwargs=kwargs, check=ConnectionPool.check_connection, open=True,
                )
                _pools[key] = pool
        self.pool = pool

    @staticmethod
    def _ensure_schema(url: str, schema: str) -> None:
        if not re.fullmatch(r"[a-z_][a-z0-9_]*", schema):
            raise ValueError(f"Bad schema name: {schema}")
        with psycopg.connect(url, autocommit=True) as conn:
            conn.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")

    @contextmanager
    def connect(self):
        with self.pool.connection() as raw:  # commits on success, rolls back on error
            yield PgConn(raw)

    def close(self) -> None:
        with _pools_lock:
            pool = _pools.pop((self.url, self.schema), None)
        if pool is not None:
            pool.close()


def make_engine(target: str, schema: str | None = None):
    return PostgresEngine(target, schema) if is_postgres(target) else SqliteEngine(target)


# --- copying a whole database (backups, moving to Neon, restoring) ------------------------

def copy_rows(src_conn, dst_conn, dst_kind: str, tables: list[str]) -> dict[str, int]:
    counts = {}
    for table in tables:
        rows = src_conn.execute(f"SELECT * FROM {table}").fetchall()
        counts[table] = len(rows)
        if not rows:
            continue
        dst_cols = dst_conn.columns(table)
        cols = [c for c in rows[0].keys() if c in dst_cols]
        sql = (f"INSERT INTO {table} ({', '.join(cols)})"
               f" VALUES ({', '.join('?' for _ in cols)})")
        for row in rows:
            dst_conn.execute(sql, tuple(row[c] for c in cols))
        if dst_kind == "postgres" and "id" in cols:
            # Explicit ids don't advance SERIAL sequences; move them past the copied rows.
            dst_conn.execute(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'),"
                f" (SELECT MAX(id) FROM {table}))"
            )
    return counts
