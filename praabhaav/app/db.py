"""Storage for campaigns, submissions, tickets, logins and the campaign tracker.

This is the single source of truth. Every other module reads and writes through
`Database`, which runs on SQLite (a local file) or Postgres (e.g. Neon's free
plan) depending on the target it's given; see `storage.py`.
"""

import os
import sqlite3
from datetime import datetime, timedelta, timezone

from .storage import INTEGRITY_ERRORS, copy_rows, make_engine

STATUSES = ("submitted", "approved", "scheduled", "paid", "issue")
# Statuses where the creator is still waiting for money.
OPEN_STATUSES = ("submitted", "approved", "scheduled")
OVERDUE_AFTER = timedelta(hours=48)
IST = timezone(timedelta(hours=5, minutes=30))
DEFAULT_DAILY_LIMIT = 100_000  # ₹; typical per-account UPI limit, change in admin



def inr(amount) -> str:
    """Indian digit grouping: 119000 -> '1,19,000'."""
    if amount is None:
        return ""
    sign, digits = ("-", str(-int(amount))) if int(amount) < 0 else ("", str(int(amount)))
    if len(digits) <= 3:
        return sign + digits
    head, tail = digits[:-3], digits[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return sign + ",".join(groups) + "," + tail


# Result of the automatic reel check (Phase 3).
# unchecked: not checked yet. passed / failed: checked. error: check couldn't run, retry.
VERIFY_STATUSES = ("unchecked", "passed", "failed", "error")

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

CREATE TABLE IF NOT EXISTS settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

-- Team members who can log in to the host dashboard.
CREATE TABLE IF NOT EXISTS hosts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL DEFAULT '',
    pw_hash     TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

-- Creator logins: Instagram handle + WhatsApp number + PIN.
CREATE TABLE IF NOT EXISTS creator_accounts (
    ig_handle   TEXT NOT NULL,
    whatsapp    TEXT NOT NULL,
    pin_hash    TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    PRIMARY KEY (ig_handle, whatsapp)
);

-- Failed login counters, for temporary lockouts.
CREATE TABLE IF NOT EXISTS login_failures (
    key           TEXT PRIMARY KEY,
    failures      INTEGER NOT NULL DEFAULT 0,
    locked_until  REAL NOT NULL DEFAULT 0
);

-- Campaign tracker: the per-campaign creator sheet.
CREATE TABLE IF NOT EXISTS roster (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id       INTEGER NOT NULL REFERENCES campaigns(id),
    handle            TEXT NOT NULL,
    profile_url       TEXT NOT NULL DEFAULT '',
    followers         INTEGER,
    post_link         TEXT NOT NULL DEFAULT '',
    price             INTEGER,
    reel_url          TEXT NOT NULL DEFAULT '',
    views             INTEGER,
    likes             INTEGER,
    comments          INTEGER,
    stats_updated_at  TEXT,
    stats_error       TEXT NOT NULL DEFAULT '',
    notes             TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_roster_campaign ON roster (campaign_id);

-- One row per campaign per day (IST): total views after that day's last refresh.
CREATE TABLE IF NOT EXISTS view_snapshots (
    campaign_id  INTEGER NOT NULL REFERENCES campaigns(id),
    day          TEXT NOT NULL,
    views        INTEGER NOT NULL,
    live_reels   INTEGER NOT NULL,
    recorded_at  TEXT NOT NULL,
    PRIMARY KEY (campaign_id, day)
);
"""

ROSTER_EDITABLE = ("handle", "profile_url", "followers", "post_link", "price", "reel_url", "notes")

# Columns added after Phase 1/2. Applied to new and existing databases alike,
# so a database created by an earlier version upgrades in place.
MIGRATIONS = [
    ("campaigns", "audio_id", "TEXT NOT NULL DEFAULT ''"),
    # Secret token for the client report link; '' means the link is off.
    ("campaigns", "report_token", "TEXT NOT NULL DEFAULT ''"),
    ("submissions", "verify_status", "TEXT NOT NULL DEFAULT 'unchecked'"),
    ("submissions", "verify_notes", "TEXT NOT NULL DEFAULT ''"),
    ("submissions", "verified_at", "TEXT"),
    ("submissions", "views", "INTEGER"),
    ("submissions", "likes", "INTEGER"),
    ("submissions", "comments", "INTEGER"),
    ("submissions", "audio_name", "TEXT NOT NULL DEFAULT ''"),
]

# answered: the agent replied and nothing needs the team.
# escalated: waiting on the core team. resolved: the team closed it.
TICKET_STATUSES = ("answered", "escalated", "resolved")


class DuplicateSubmission(Exception):
    pass


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


# Every table, parents before children (the order backups and copies use).
TABLES = ["campaigns", "submissions", "tickets", "settings", "hosts", "creator_accounts",
          "login_failures", "roster", "view_snapshots"]


def database_target_from_env() -> str:
    """DATABASE_URL (Postgres, e.g. Neon) wins; otherwise the SQLite file PRAABHAAV_DB."""
    return os.environ.get("DATABASE_URL") or os.environ.get("PRAABHAAV_DB", "praabhaav.db")


class Database:
    def __init__(self, target: str, schema: str | None = None):
        """``target`` is a SQLite file path or a postgres:// URL.
        ``schema`` (Postgres only) isolates data, e.g. one schema per test."""
        self.path = target
        self.engine = make_engine(target, schema)
        self.kind = self.engine.kind
        with self.connect() as conn:
            conn.executescript(SCHEMA)
            existing_by_table: dict[str, set[str]] = {}
            for table, column, ddl in MIGRATIONS:
                existing = existing_by_table.setdefault(table, conn.columns(table))
                if column not in existing:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
                    existing.add(column)

    def connect(self):
        """Context manager yielding a connection; commits on success."""
        return self.engine.connect()

    def close(self) -> None:
        self.engine.close()

    def is_empty(self) -> bool:
        with self.connect() as conn:
            return not any(conn.execute(f"SELECT 1 FROM {t} LIMIT 1").fetchone()
                           for t in ("campaigns", "submissions", "roster", "hosts"))

    def copy_into(self, other: "Database") -> dict[str, int]:
        """Copy every row into an empty database (backup, restore, move to Neon)."""
        if not other.is_empty():
            raise ValueError("The destination database already has data; refusing to merge.")
        with self.connect() as src, other.connect() as dst:
            return copy_rows(src, dst, other.kind, TABLES)

    # --- campaigns ---------------------------------------------------------

    def create_campaign(
        self, name: str, song: str, client: str, default_amount: int, audio_id: str = ""
    ) -> int:
        with self.connect() as conn:
            return conn.insert(
                "INSERT INTO campaigns (name, song, client, default_amount, audio_id, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (name, song, client, default_amount, audio_id, to_iso(now_utc())),
            )

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

    def set_report_token(self, campaign_id: int, token: str) -> None:
        with self.connect() as conn:
            conn.execute("UPDATE campaigns SET report_token = ? WHERE id = ?", (token, campaign_id))

    def get_campaign_by_report_token(self, token: str) -> sqlite3.Row | None:
        if not token:
            return None
        with self.connect() as conn:
            return conn.execute(
                "SELECT * FROM campaigns WHERE report_token = ?", (token,)
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
                return conn.insert(
                    "INSERT INTO submissions (campaign_id, ig_handle, whatsapp, upi_id,"
                    " reel_url, amount, submitted_at, updated_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (campaign_id, ig_handle, whatsapp, upi_id, reel_url,
                     campaign["default_amount"], ts, ts),
                )
        except INTEGRITY_ERRORS as exc:
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

    # --- reel verification -------------------------------------------------

    def pending_verification(self, limit: int = 50) -> list[sqlite3.Row]:
        """Submitted reels not yet checked, or whose last check couldn't run."""
        with self.connect() as conn:
            return conn.execute(
                "SELECT s.*, c.name AS campaign_name, c.song AS campaign_song,"
                " c.audio_id AS campaign_audio_id"
                " FROM submissions s JOIN campaigns c ON c.id = s.campaign_id"
                " WHERE s.status = 'submitted' AND s.verify_status IN ('unchecked', 'error')"
                " ORDER BY s.submitted_at ASC LIMIT ?",
                (limit,),
            ).fetchall()

    def record_verification(
        self, submission_id: int, verify_status: str, notes: str, *,
        views: int | None = None, likes: int | None = None, comments: int | None = None,
        audio_name: str = "", approve: bool = False,
    ) -> None:
        if verify_status not in VERIFY_STATUSES:
            raise ValueError(f"Invalid verify status: {verify_status}")
        ts = to_iso(now_utc())
        with self.connect() as conn:
            conn.execute(
                "UPDATE submissions SET verify_status = ?, verify_notes = ?, verified_at = ?,"
                " views = COALESCE(?, views), likes = COALESCE(?, likes),"
                " comments = COALESCE(?, comments), audio_name = ?, updated_at = ?"
                " WHERE id = ?",
                (verify_status, notes, ts, views, likes, comments, audio_name, ts,
                 submission_id),
            )
            if approve:
                # Only moves reels that are still 'submitted', never overrides the team.
                conn.execute(
                    "UPDATE submissions SET status = 'approved' WHERE id = ? AND status = 'submitted'",
                    (submission_id,),
                )

    # --- payouts -----------------------------------------------------------

    def get_setting(self, key: str) -> str | None:
        with self.connect() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None

    def set_setting(self, key: str, value: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?)"
                " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def get_daily_limit(self) -> int:
        value = self.get_setting("daily_limit")
        return int(value) if value else DEFAULT_DAILY_LIMIT

    def set_daily_limit(self, amount: int) -> None:
        self.set_setting("daily_limit", str(amount))

    def backup_to(self, path: str) -> None:
        """Consistent SQLite copy of the live database (safe while the app is running).
        From Postgres the rows are copied into a fresh SQLite file, so a backup is
        always a single .db file that opens anywhere."""
        if self.kind == "sqlite":
            src = sqlite3.connect(self.path)
            dst = sqlite3.connect(path)
            try:
                src.backup(dst)
            finally:
                dst.close()
                src.close()
            return
        self.copy_into(Database(path))

    def payout_queue(self) -> list[sqlite3.Row]:
        """Approved/scheduled payments, oldest submission first."""
        with self.connect() as conn:
            return conn.execute(
                "SELECT s.*, c.name AS campaign_name FROM submissions s"
                " JOIN campaigns c ON c.id = s.campaign_id"
                " WHERE s.status IN ('approved', 'scheduled')"
                " ORDER BY s.submitted_at ASC, s.id ASC"
            ).fetchall()

    def paid_since(self, since: datetime) -> int:
        with self.connect() as conn:
            return conn.execute(
                "SELECT COALESCE(SUM(amount), 0) FROM submissions"
                " WHERE status = 'paid' AND paid_at >= ?",
                (to_iso(since.astimezone(timezone.utc)),),
            ).fetchone()[0]

    def mark_paid(self, submission_ids: list[int]) -> int:
        """Bulk-mark approved/scheduled payments as paid. Returns how many changed."""
        if not submission_ids:
            return 0
        ts = to_iso(now_utc())
        placeholders = ",".join("?" for _ in submission_ids)
        with self.connect() as conn:
            cur = conn.execute(
                f"UPDATE submissions SET status = 'paid', paid_at = ?, updated_at = ?"
                f" WHERE id IN ({placeholders}) AND status IN ('approved', 'scheduled')",
                (ts, ts, *submission_ids),
            )
            return cur.rowcount

    # --- hosts & creator accounts -------------------------------------------

    def add_host(self, username: str, name: str, pw_hash: str) -> int:
        with self.connect() as conn:
            return conn.insert(
                "INSERT INTO hosts (username, name, pw_hash, created_at) VALUES (?, ?, ?, ?)",
                (username, name, pw_hash, to_iso(now_utc())),
            )

    def get_host(self, username: str) -> sqlite3.Row | None:
        with self.connect() as conn:
            return conn.execute("SELECT * FROM hosts WHERE username = ?", (username,)).fetchone()

    def list_hosts(self) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute("SELECT * FROM hosts ORDER BY username").fetchall()

    def set_host_password(self, username: str, pw_hash: str) -> None:
        with self.connect() as conn:
            conn.execute("UPDATE hosts SET pw_hash = ? WHERE username = ?", (pw_hash, username))

    def delete_host(self, username: str) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM hosts WHERE username = ?", (username,))

    def get_creator_account(self, ig_handle: str, whatsapp: str) -> sqlite3.Row | None:
        with self.connect() as conn:
            return conn.execute(
                "SELECT * FROM creator_accounts WHERE ig_handle = ? AND whatsapp = ?",
                (ig_handle, whatsapp),
            ).fetchone()

    def set_creator_pin(self, ig_handle: str, whatsapp: str, pin_hash: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO creator_accounts (ig_handle, whatsapp, pin_hash, created_at)"
                " VALUES (?, ?, ?, ?) ON CONFLICT(ig_handle, whatsapp)"
                " DO UPDATE SET pin_hash = excluded.pin_hash",
                (ig_handle, whatsapp, pin_hash, to_iso(now_utc())),
            )

    def delete_creator_account(self, ig_handle: str, whatsapp: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "DELETE FROM creator_accounts WHERE ig_handle = ? AND whatsapp = ?",
                (ig_handle, whatsapp),
            )
            conn.execute("DELETE FROM login_failures WHERE key = ?",
                         (f"creator:{ig_handle}:{whatsapp}",))

    def is_locked(self, key: str, now: float) -> bool:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT locked_until FROM login_failures WHERE key = ?", (key,)
            ).fetchone()
        return bool(row and row["locked_until"] > now)

    def record_login_failure(self, key: str, now: float, max_failures: int, lock_seconds: int) -> None:
        with self.connect() as conn:
            row = conn.execute("SELECT failures FROM login_failures WHERE key = ?", (key,)).fetchone()
            failures = (row["failures"] if row else 0) + 1
            locked_until = now + lock_seconds if failures >= max_failures else 0
            if locked_until:
                failures = 0
            conn.execute(
                "INSERT INTO login_failures (key, failures, locked_until) VALUES (?, ?, ?)"
                " ON CONFLICT(key) DO UPDATE SET failures = excluded.failures,"
                " locked_until = excluded.locked_until",
                (key, failures, locked_until),
            )

    def clear_login_failures(self, key: str) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM login_failures WHERE key = ?", (key,))

    # --- campaign tracker (roster) -----------------------------------------

    def add_roster_row(self, campaign_id: int, **fields) -> int:
        fields = {k: v for k, v in fields.items() if k in ROSTER_EDITABLE}
        ts = to_iso(now_utc())
        cols = ["campaign_id", *fields, "created_at", "updated_at"]
        with self.connect() as conn:
            return conn.insert(
                f"INSERT INTO roster ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
                (campaign_id, *fields.values(), ts, ts),
            )

    def get_roster_row(self, row_id: int) -> sqlite3.Row | None:
        with self.connect() as conn:
            return conn.execute("SELECT * FROM roster WHERE id = ?", (row_id,)).fetchone()

    def list_roster(self, campaign_id: int) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute(
                "SELECT * FROM roster WHERE campaign_id = ? ORDER BY id", (campaign_id,)
            ).fetchall()

    def update_roster_row(self, row_id: int, **fields) -> None:
        fields = {k: v for k, v in fields.items() if k in ROSTER_EDITABLE}
        if not fields:
            return
        sets = ", ".join(f"{k} = ?" for k in fields)
        with self.connect() as conn:
            conn.execute(
                f"UPDATE roster SET {sets}, updated_at = ? WHERE id = ?",
                (*fields.values(), to_iso(now_utc()), row_id),
            )

    def set_roster_stats(self, row_id: int, *, views=None, likes=None, comments=None,
                         followers=None, error: str = "") -> None:
        with self.connect() as conn:
            conn.execute(
                "UPDATE roster SET views = COALESCE(?, views), likes = COALESCE(?, likes),"
                " comments = COALESCE(?, comments), followers = COALESCE(?, followers),"
                " stats_error = ?, stats_updated_at = ? WHERE id = ?",
                (views, likes, comments, followers, error, to_iso(now_utc()), row_id),
            )

    def delete_roster_row(self, row_id: int) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM roster WHERE id = ?", (row_id,))

    def save_snapshot(self, campaign_id: int, day: str, views: int, live_reels: int) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO view_snapshots (campaign_id, day, views, live_reels, recorded_at)"
                " VALUES (?, ?, ?, ?, ?) ON CONFLICT(campaign_id, day) DO UPDATE SET"
                " views = excluded.views, live_reels = excluded.live_reels,"
                " recorded_at = excluded.recorded_at",
                (campaign_id, day, views, live_reels, to_iso(now_utc())),
            )

    def list_snapshots(self, campaign_id: int) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute(
                "SELECT day, views, live_reels FROM view_snapshots WHERE campaign_id = ?"
                " ORDER BY day", (campaign_id,),
            ).fetchall()

    def active_roster_with_reels(self) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute(
                "SELECT r.* FROM roster r JOIN campaigns c ON c.id = r.campaign_id"
                " WHERE c.active = 1 AND r.reel_url != ''"
            ).fetchall()

    # --- tickets -----------------------------------------------------------

    def add_ticket(
        self, *, access_token: str, role: str, name: str, contact: str,
        campaign_id: int | None, message: str, category: str, priority: str,
        ai_reply: str, team_summary: str, handled_by: str, escalated: bool,
    ) -> int:
        ts = to_iso(now_utc())
        with self.connect() as conn:
            return conn.insert(
                "INSERT INTO tickets (access_token, role, name, contact, campaign_id, message,"
                " category, priority, ai_reply, team_summary, handled_by, status,"
                " created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (access_token, role, name, contact, campaign_id, message, category, priority,
                 ai_reply, team_summary, handled_by,
                 "escalated" if escalated else "answered", ts, ts),
            )

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
                f" COALESCE(SUM(CASE WHEN submitted_at < ? THEN 1 ELSE 0 END), 0) AS overdue"
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
