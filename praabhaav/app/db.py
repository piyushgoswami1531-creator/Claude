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

-- Queries from creators and clients, triaged by the agent.
CREATE TABLE IF NOT EXISTS tickets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    access_token  TEXT NOT NULL UNIQUE,
    role          TEXT NOT NULL,              -- 'creator' or 'client'
    name          TEXT NOT NULL,              -- IG handle (creator) or name (client)
    contact       TEXT NOT NULL,              -- WhatsApp number
    campaign_id   INTEGER REFERENCES campaigns(id),
    message       TEXT NOT NULL,
    category      TEXT NOT NULL,
    priority      TEXT NOT NULL,
    ai_reply      TEXT NOT NULL,
    team_summary  TEXT NOT NULL,
    handled_by    TEXT NOT NULL,              -- 'claude' or 'rules'
    status        TEXT NOT NULL,
    team_reply    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_sender ON tickets (name, contact);
"""

# answered: the agent replied and nothing needs the team.
# escalated: waiting on the core team. resolved: the team closed it.
TICKET_STATUSES = ("answered", "escalated", "resolved")


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
        self, submission_id: int, status: str, amount: int, note: str,
        upi_id: str | None = None,
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
            if upi_id:
                conn.execute(
                    "UPDATE submissions SET upi_id = ? WHERE id = ?", (upi_id, submission_id)
                )

    def list_overdue(self) -> list[sqlite3.Row]:
        cutoff = to_iso(now_utc() - OVERDUE_AFTER)
        placeholders = ",".join("?" for _ in OPEN_STATUSES)
        with self.connect() as conn:
            return conn.execute(
                "SELECT s.*, c.name AS campaign_name FROM submissions s"
                " JOIN campaigns c ON c.id = s.campaign_id"
                f" WHERE s.status IN ({placeholders}) AND s.submitted_at < ?"
                " ORDER BY s.submitted_at ASC",
                (*OPEN_STATUSES, cutoff),
            ).fetchall()

    # --- tickets -----------------------------------------------------------

    def add_ticket(
        self, *, access_token: str, role: str, name: str, contact: str,
        campaign_id: int | None, message: str, category: str, priority: str,
        ai_reply: str, team_summary: str, handled_by: str, escalated: bool,
    ) -> int:
        ts = to_iso(now_utc())
        with self.connect() as conn:
            cur = conn.execute(
                "INSERT INTO tickets (access_token, role, name, contact, campaign_id, message,"
                " category, priority, ai_reply, team_summary, handled_by, status,"
                " created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (access_token, role, name, contact, campaign_id, message, category, priority,
                 ai_reply, team_summary, handled_by,
                 "escalated" if escalated else "answered", ts, ts),
            )
            return cur.lastrowid

    def get_ticket(self, ticket_id: int) -> sqlite3.Row | None:
        with self.connect() as conn:
            return conn.execute(
                "SELECT t.*, c.name AS campaign_name FROM tickets t"
                " LEFT JOIN campaigns c ON c.id = t.campaign_id WHERE t.id = ?",
                (ticket_id,),
            ).fetchone()

    def list_tickets(self, status: str | None = None) -> list[sqlite3.Row]:
        sql = (
            "SELECT t.*, c.name AS campaign_name FROM tickets t"
            " LEFT JOIN campaigns c ON c.id = t.campaign_id"
        )
        params: list = []
        if status:
            sql += " WHERE t.status = ?"
            params.append(status)
        sql += (
            " ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,"
            " t.created_at ASC"
        )
        with self.connect() as conn:
            return conn.execute(sql, params).fetchall()

    def find_tickets_for_creator(self, ig_handle: str, whatsapp: str) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute(
                "SELECT * FROM tickets WHERE role = 'creator' AND name = ? AND contact = ?"
                " ORDER BY created_at DESC",
                (ig_handle, whatsapp),
            ).fetchall()

    def update_ticket(self, ticket_id: int, status: str, team_reply: str) -> None:
        if status not in TICKET_STATUSES:
            raise ValueError(f"Invalid ticket status: {status}")
        with self.connect() as conn:
            conn.execute(
                "UPDATE tickets SET status = ?, team_reply = ?, updated_at = ? WHERE id = ?",
                (status, team_reply, to_iso(now_utc()), ticket_id),
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
            open_tickets = conn.execute(
                "SELECT COUNT(*) FROM tickets WHERE status = 'escalated'"
            ).fetchone()[0]
        return {
            "pending": row["pending"],
            "pending_amount": row["pending_amount"],
            "overdue": row["overdue"],
            "issues": issues,
            "open_tickets": open_tickets,
        }


def is_overdue(row: sqlite3.Row) -> bool:
    if row["status"] not in OPEN_STATUSES:
        return False
    submitted = datetime.fromisoformat(row["submitted_at"])
    return now_utc() - submitted > OVERDUE_AFTER
