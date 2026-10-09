"""SQLite storage for campaigns and creator submissions.

This is the single source of truth for payments. Later phases (query agent,
Google Sheets sync, reel verification) read and write through this module.
"""

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

STATUSES = ("submitted", "approved", "scheduled", "paid", "issue")
# Statuses where the creator is still waiting for money.
OPEN_STATUSES = ("submitted", "approved", "scheduled")
OVERDUE_AFTER = timedelta(hours=48)

SCHEMA = """
CREATE TABLE IF NOT EXISTS campaigns (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    song            TEXT NOT NULL DEFAULT '',
    client          TEXT NOT NULL DEFAULT '',
    default_amount  INTEGER NOT NULL DEFAULT 0,
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id   INTEGER NOT NULL REFERENCES campaigns(id),
    ig_handle     TEXT NOT NULL,
    whatsapp      TEXT NOT NULL,
    upi_id        TEXT NOT NULL,
    reel_url      TEXT NOT NULL,
    amount        INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'submitted',
    note          TEXT NOT NULL DEFAULT '',
    submitted_at  TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    paid_at       TEXT,
    UNIQUE (campaign_id, ig_handle)
);

CREATE INDEX IF NOT EXISTS idx_submissions_lookup
    ON submissions (ig_handle, whatsapp);
"""


class DuplicateSubmission(Exception):
    pass


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


class Database:
    def __init__(self, path: str):
        self.path = path
        with self.connect() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    # --- campaigns ---------------------------------------------------------

    def create_campaign(self, name: str, song: str, client: str, default_amount: int) -> int:
        with self.connect() as conn:
            cur = conn.execute(
                "INSERT INTO campaigns (name, song, client, default_amount, created_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (name, song, client, default_amount, to_iso(now_utc())),
            )
            return cur.lastrowid

    def list_campaigns(self, active_only: bool = False) -> list[sqlite3.Row]:
        sql = "SELECT * FROM campaigns"
        if active_only:
            sql += " WHERE active = 1"
        with self.connect() as conn:
            return conn.execute(sql + " ORDER BY id DESC").fetchall()

    def get_campaign(self, campaign_id: int) -> sqlite3.Row | None:
        with self.connect() as conn:
            return conn.execute(
                "SELECT * FROM campaigns WHERE id = ?", (campaign_id,)
            ).fetchone()

    def set_campaign_active(self, campaign_id: int, active: bool) -> None:
        with self.connect() as conn:
            conn.execute(
                "UPDATE campaigns SET active = ? WHERE id = ?", (int(active), campaign_id)
            )

    # --- submissions -------------------------------------------------------

    def add_submission(
        self, campaign_id: int, ig_handle: str, whatsapp: str, upi_id: str, reel_url: str
    ) -> int:
        campaign = self.get_campaign(campaign_id)
        if campaign is None:
            raise ValueError("Unknown campaign")
        ts = to_iso(now_utc())
        try:
            with self.connect() as conn:
                cur = conn.execute(
                    "INSERT INTO submissions (campaign_id, ig_handle, whatsapp, upi_id,"
                    " reel_url, amount, submitted_at, updated_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (campaign_id, ig_handle, whatsapp, upi_id, reel_url,
                     campaign["default_amount"], ts, ts),
                )
                return cur.lastrowid
        except sqlite3.IntegrityError as exc:
            raise DuplicateSubmission() from exc

    def get_submission(self, submission_id: int) -> sqlite3.Row | None:
        with self.connect() as conn:
            return conn.execute(
                "SELECT * FROM submissions WHERE id = ?", (submission_id,)
            ).fetchone()

    def find_for_creator(self, ig_handle: str, whatsapp: str) -> list[sqlite3.Row]:
        """A creator only ever sees rows matching both their handle and number."""
        with self.connect() as conn:
            return conn.execute(
                "SELECT s.*, c.name AS campaign_name, c.song AS campaign_song"
                " FROM submissions s JOIN campaigns c ON c.id = s.campaign_id"
                " WHERE s.ig_handle = ? AND s.whatsapp = ?"
                " ORDER BY s.submitted_at DESC",
                (ig_handle, whatsapp),
            ).fetchall()

    def list_submissions(
        self, status: str | None = None, campaign_id: int | None = None
    ) -> list[sqlite3.Row]:
        sql = (
            "SELECT s.*, c.name AS campaign_name FROM submissions s"
            " JOIN campaigns c ON c.id = s.campaign_id WHERE 1 = 1"
        )
        params: list = []
        if status:
            sql += " AND s.status = ?"
            params.append(status)
        if campaign_id:
            sql += " AND s.campaign_id = ?"
            params.append(campaign_id)
        sql += " ORDER BY s.submitted_at ASC"
        with self.connect() as conn:
            return conn.execute(sql, params).fetchall()

    def update_submission(
        self, submission_id: int, status: str, amount: int, note: str
    ) -> None:
        if status not in STATUSES:
            raise ValueError(f"Invalid status: {status}")
        ts = to_iso(now_utc())
        with self.connect() as conn:
            current = conn.execute(
                "SELECT status, paid_at FROM submissions WHERE id = ?", (submission_id,)
            ).fetchone()
            if current is None:
                raise ValueError("Unknown submission")
            if status == "paid":
                paid_at = current["paid_at"] or ts
            else:
                paid_at = None
            conn.execute(
                "UPDATE submissions SET status = ?, amount = ?, note = ?,"
                " updated_at = ?, paid_at = ? WHERE id = ?",
                (status, amount, note, ts, paid_at, submission_id),
            )

    def stats(self) -> dict:
        cutoff = to_iso(now_utc() - OVERDUE_AFTER)
        placeholders = ",".join("?" for _ in OPEN_STATUSES)
        with self.connect() as conn:
            row = conn.execute(
                f"SELECT COUNT(*) AS pending, COALESCE(SUM(amount), 0) AS pending_amount,"
                f" COALESCE(SUM(submitted_at < ?), 0) AS overdue"
                f" FROM submissions WHERE status IN ({placeholders})",
                (cutoff, *OPEN_STATUSES),
            ).fetchone()
            issues = conn.execute(
                "SELECT COUNT(*) FROM submissions WHERE status = 'issue'"
            ).fetchone()[0]
        return {
            "pending": row["pending"],
            "pending_amount": row["pending_amount"],
            "overdue": row["overdue"],
            "issues": issues,
        }


def is_overdue(row: sqlite3.Row) -> bool:
    if row["status"] not in OPEN_STATUSES:
        return False
    submitted = datetime.fromisoformat(row["submitted_at"])
    return now_utc() - submitted > OVERDUE_AFTER
