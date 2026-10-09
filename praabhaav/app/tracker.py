"""Campaign tracker: the per-campaign creator sheet, kept in the app.

Each row is one creator on one campaign: profile, followers, post link, price
per reel and the live reel link. Live views/likes come from the Apify Reel
Scraper and follower counts from the Apify Profile Scraper.
"""

import csv
import io
import logging
import re
import threading
import time

from .db import Database
from .reels import BATCH_SIZE, shortcode

log = logging.getLogger(__name__)

PROFILE_RE = re.compile(r"instagram\.com/([A-Za-z0-9._]{1,30})", re.I)
HANDLE_RE = re.compile(r"^@?([A-Za-z0-9._]{1,30})$")
NOT_PROFILES = {"p", "reel", "reels", "stories", "explore", "accounts", "tv"}


def parse_profile(raw: str) -> tuple[str, str]:
    """'@riya', 'riya' or an instagram.com/riya link -> ('riya', profile URL)."""
    raw = (raw or "").strip()
    m = PROFILE_RE.search(raw)
    handle = m.group(1) if m and m.group(1).lower() not in NOT_PROFILES else None
    if handle is None:
        m = HANDLE_RE.match(raw)
        handle = m.group(1) if m else None
    if not handle:
        raise ValueError("Enter an Instagram handle (@name) or profile link.")
    handle = handle.lower()
    return handle, f"https://www.instagram.com/{handle}/"


def parse_count(raw) -> int | None:
    """'12,500' / '12.5K' / '1.2M' / '1.5 lakh' -> int. Blank -> None."""
    if raw is None:
        return None
    text = str(raw).strip().lower().replace(",", "").replace("₹", "").replace("rs", "")
    if not text:
        return None
    m = re.match(r"^(\d+(?:\.\d+)?)\s*(k|m|l|lakh|lac|cr)?$", text)
    if not m:
        raise ValueError(f"Can't read the number '{raw}'.")
    mult = {"k": 1e3, "m": 1e6, "l": 1e5, "lakh": 1e5, "lac": 1e5, "cr": 1e7}.get(m.group(2), 1)
    return int(round(float(m.group(1)) * mult))


def clean_link(raw: str) -> str:
    link = (raw or "").strip()
    if link and not re.match(r"^https?://", link):
        raise ValueError("Links must start with https://")
    return link.split("?")[0]


EDITABLE_FIELDS = ("handle", "profile_url", "followers", "post_link", "price", "reel_url", "notes")


def clean_row(data: dict) -> dict:
    """Validate a row from the add form, inline edit or CSV import."""
    out: dict = {}
    if "handle" in data or "profile_url" in data:
        out["handle"], out["profile_url"] = parse_profile(
            data.get("profile_url") or data.get("handle") or ""
        )
    for field in ("followers", "price"):
        if field in data:
            out[field] = parse_count(data[field])
    for field in ("post_link", "reel_url"):
        if field in data:
            out[field] = clean_link(data[field])
    if "notes" in data:
        out["notes"] = str(data["notes"]).strip()[:500]
    return out


def row_cpm(row) -> float | None:
    """Cost per 1,000 views, in rupees."""
    if row["price"] and row["views"]:
        return row["price"] * 1000 / row["views"]
    return None


def totals(rows) -> dict:
    spend = sum(r["price"] or 0 for r in rows)
    views = sum(r["views"] or 0 for r in rows)
    priced_with_views = [r for r in rows if r["price"] and r["views"]]
    paid_for_views = sum(r["price"] for r in priced_with_views)
    viewed = sum(r["views"] for r in priced_with_views)
    return {
        "creators": len(rows),
        "live": sum(1 for r in rows if r["reel_url"]),
        "spend": spend,
        "views": views,
        "likes": sum(r["likes"] or 0 for r in rows),
        "reach": sum(r["followers"] or 0 for r in rows),
        "cpm": paid_for_views * 1000 / viewed if viewed else None,
        "max_views": max((r["views"] or 0 for r in rows), default=0),
    }


# --- client report -----------------------------------------------------------------

def client_report(rows) -> dict:
    """What a client may see: reach and performance only. Never prices, spend,
    cost per view, notes or creator contact details."""
    # Reels Apify reported as deleted/private stay off the client's page until
    # the team fixes them (the error is shown in the team's tracker).
    live = sorted((r for r in rows if r["reel_url"] and not r["stats_error"]),
                  key=lambda r: (r["views"] or 0), reverse=True)
    with_views = [r for r in live if r["views"]]
    reels = [{
        "handle": r["handle"], "profile_url": r["profile_url"], "followers": r["followers"],
        "reel_url": r["reel_url"], "views": r["views"], "likes": r["likes"],
        "comments": r["comments"],
    } for r in live]
    updated = max((r["stats_updated_at"] for r in live if r["stats_updated_at"]), default=None)
    total_views = sum(r["views"] or 0 for r in live)
    return {
        "creators": len(rows),
        "live": len(live),
        "views": total_views,
        "likes": sum(r["likes"] or 0 for r in live),
        "comments": sum(r["comments"] or 0 for r in live),
        "reach": sum(r["followers"] or 0 for r in rows),
        "avg_views": total_views // len(with_views) if with_views else None,
        "max_views": max((r["views"] or 0 for r in live), default=0),
        "reels": reels,
        "updated": updated,
    }


REPORT_CSV_COLUMNS = ["handle", "profile_url", "followers", "reel_url", "views", "likes", "comments"]


def report_csv(report: dict) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(REPORT_CSV_COLUMNS)
    for reel in report["reels"]:
        writer.writerow([reel[c] if reel[c] is not None else "" for c in REPORT_CSV_COLUMNS])
    return buf.getvalue()


# --- CSV import / export ------------------------------------------------------------

COLUMN_HINTS = [  # first matching hint wins, checked against lowercase header text
    ("reel_url", ("live reel", "reel link", "reel url", "live link", "live url")),
    ("post_link", ("post link", "post url")),
    ("profile_url", ("profile", "handle", "username", "creator", "instagram", "account", "name")),
    ("followers", ("follower",)),
    ("price", ("price", "rate", "cost", "amount", "fee", "₹")),
    ("notes", ("note", "remark")),
]
# Stats the app fetches itself; such columns in an old sheet are ignored.
IGNORED_HEADERS = ("view", "like", "comment", "cpm", "engagement")


def map_columns(headers: list[str]) -> dict[int, str]:
    mapping: dict[int, str] = {}
    used: set[str] = set()
    for i, header in enumerate(headers):
        h = header.strip().lower()
        if any(x in h for x in IGNORED_HEADERS):
            continue
        for field, hints in COLUMN_HINTS:
            if field not in used and any(hint in h for hint in hints):
                mapping[i] = field
                used.add(field)
                break
    return mapping


def parse_csv(text: str) -> tuple[list[dict], list[str]]:
    """CSV exported from Google Sheets/Excel -> (clean rows, problems)."""
    reader = csv.reader(io.StringIO(text.lstrip("﻿")))
    rows = list(reader)
    if not rows:
        return [], ["The file is empty."]
    mapping = map_columns(rows[0])
    if "profile_url" not in mapping.values():
        return [], ["Couldn't find a creator/profile/handle column in the header row."]
    good, problems = [], []
    for line_no, cells in enumerate(rows[1:], start=2):
        if not any(c.strip() for c in cells):
            continue
        raw = {field: cells[i] for i, field in mapping.items() if i < len(cells)}
        try:
            good.append(clean_row(raw))
        except ValueError as exc:
            problems.append(f"Row {line_no}: {exc}")
    return good, problems


EXPORT_COLUMNS = ["handle", "profile_url", "followers", "post_link", "price", "reel_url",
                  "views", "likes", "comments", "cpm", "stats_updated_at", "notes"]


def to_csv(rows) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(EXPORT_COLUMNS)
    for r in rows:
        cpm = row_cpm(r)
        values = [r[c] if c != "cpm" else (round(cpm, 2) if cpm else "") for c in EXPORT_COLUMNS]
        writer.writerow(["'" + v if isinstance(v, str) and v[:1] in "=+-@" else v for v in values])
    return buf.getvalue()


# --- live stats from Apify -----------------------------------------------------------

class Jobs:
    """Tracks background refreshes per campaign so the page can show progress."""

    def __init__(self):
        self._lock = threading.Lock()
        self._jobs: dict[int, dict] = {}

    def start(self, campaign_id: int, kind: str) -> bool:
        with self._lock:
            job = self._jobs.get(campaign_id)
            if job and job["state"] == "running":
                return False
            self._jobs[campaign_id] = {"state": "running", "kind": kind, "message": "",
                                       "started": time.time()}
            return True

    def finish(self, campaign_id: int, message: str, ok: bool = True) -> None:
        with self._lock:
            job = self._jobs.setdefault(campaign_id, {"kind": ""})
            job.update(state="done" if ok else "error", message=message, finished=time.time())

    def get(self, campaign_id: int) -> dict:
        with self._lock:
            return dict(self._jobs.get(campaign_id) or {"state": "idle"})


def refresh_views(db: Database, rows, client) -> str:
    rows = [r for r in rows if shortcode(r["reel_url"])]
    if not rows:
        return "No live reel links to check yet."
    updated = missing = 0
    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start:start + BATCH_SIZE]
        items = client.fetch([r["reel_url"] for r in batch])
        for r in batch:
            item = items.get(shortcode(r["reel_url"]))
            if not item or item.get("error"):
                db.set_roster_stats(r["id"], error="Reel not found (deleted or private?)")
                missing += 1
                continue
            db.set_roster_stats(
                r["id"],
                views=item.get("videoPlayCount") or item.get("videoViewCount"),
                likes=item.get("likesCount"),
                comments=item.get("commentsCount"),
            )
            updated += 1
    msg = f"Updated views for {updated} reel{'s' if updated != 1 else ''}"
    return msg + (f", {missing} not found" if missing else "") + "."


def refresh_followers(db: Database, rows, client) -> str:
    if not rows:
        return "No creators yet."
    profiles = client.fetch_profiles(sorted({r["handle"] for r in rows}))
    updated = 0
    for r in rows:
        p = profiles.get(r["handle"])
        if p and p.get("followersCount") is not None:
            db.set_roster_stats(r["id"], followers=p["followersCount"])
            updated += 1
    missing = len(rows) - updated
    return f"Updated followers for {updated} creator{'s' if updated != 1 else ''}" + (
        f", {missing} not found" if missing else "") + "."


def run_job(jobs: Jobs, campaign_id: int, fn, *args) -> None:
    try:
        jobs.finish(campaign_id, fn(*args))
    except Exception as exc:
        log.exception("Tracker refresh failed")
        jobs.finish(campaign_id, f"Couldn't reach Apify ({type(exc).__name__}). Try again.", ok=False)
