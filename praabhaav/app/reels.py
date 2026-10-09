"""Automatic reel verification using the Apify Instagram Reel Scraper.

For every reel still in 'submitted' state the checker confirms that:
1. the reel exists and is public,
2. it was posted by the creator who submitted it,
3. it uses the campaign's audio (exact Instagram audio ID if the campaign has
   one, otherwise the campaign song name appears in the reel's song name).

Passing reels are approved automatically. Failing reels are never rejected
automatically: they are flagged with the reasons so a person can decide.

Run every 30 minutes, e.g. with cron:
    */30 * * * *  cd /path/to/praabhaav && python -m app.reels
"""

import logging
import os
import re
import threading
from dataclasses import dataclass, field

import httpx

from .db import Database
from .notify import Notifier

log = logging.getLogger(__name__)

APIFY_URL = (
    "https://api.apify.com/v2/acts/apify~instagram-reel-scraper/run-sync-get-dataset-items"
)
SHORTCODE_RE = re.compile(r"instagram\.com/(?:reel|reels|p)/([A-Za-z0-9_-]+)")
# One check at a time: the scheduler and the admin button can both trigger a run.
_run_lock = threading.Lock()
BATCH_SIZE = 20  # keeps one Apify run well under its 5-minute sync limit


def shortcode(url: str) -> str | None:
    m = SHORTCODE_RE.search(url or "")
    return m.group(1) if m else None


class ApifyReelFetcher:
    # Apify's sync endpoint gives up at 300s; wait a little longer than that.
    def __init__(self, token: str, timeout: float = 320):
        self.token = token
        self.timeout = timeout

    @classmethod
    def from_env(cls) -> "ApifyReelFetcher | None":
        token = os.environ.get("APIFY_TOKEN")
        return cls(token) if token else None

    def fetch(self, urls: list[str]) -> dict[str, dict]:
        """One Apify run for all URLs. Returns shortcode -> scraped reel item."""
        r = httpx.post(
            APIFY_URL,
            # Token in a header, not the query string, so it never lands in logs.
            headers={"Authorization": f"Bearer {self.token}"},
            json={"username": urls, "resultsLimit": 1},
            timeout=self.timeout,
        )
        r.raise_for_status()
        items: dict[str, dict] = {}
        for item in r.json():
            # Error items (e.g. {"url": ..., "error": "not_found"}) carry only "url".
            code = (
                item.get("shortCode")
                or shortcode(item.get("inputUrl", ""))
                or shortcode(item.get("url", ""))
            )
            if code:
                items[code] = item
        return items


@dataclass
class CheckResult:
    passed: bool
    reasons: list[str] = field(default_factory=list)
    views: int | None = None
    likes: int | None = None
    comments: int | None = None
    audio_name: str = ""


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").casefold()).strip()


def check_reel(submission, item: dict | None) -> CheckResult:
    if not item or item.get("error"):
        return CheckResult(False, ["Reel not found: it may be deleted, private, or the link is wrong."])

    music = item.get("musicInfo") or {}
    song, artist = music.get("song_name", ""), music.get("artist_name", "")
    audio_name = " – ".join(x for x in (song, artist) if x)
    result = CheckResult(
        True,
        views=item.get("videoPlayCount") or item.get("videoViewCount"),
        likes=item.get("likesCount"),
        comments=item.get("commentsCount"),
        audio_name=audio_name,
    )

    owner = (item.get("ownerUsername") or "").lower()
    if owner != submission["ig_handle"]:
        result.passed = False
        result.reasons.append(f"Posted by @{owner or 'unknown'}, not @{submission['ig_handle']}.")

    campaign_audio_id = submission["campaign_audio_id"]
    campaign_song = _norm(submission["campaign_song"])
    if campaign_audio_id:
        if music.get("audio_id") != campaign_audio_id:
            result.passed = False
            result.reasons.append(f"Uses audio '{audio_name or 'unknown'}', not the campaign audio.")
    elif campaign_song:
        if music.get("uses_original_audio") or campaign_song not in _norm(song):
            result.passed = False
            result.reasons.append(
                f"Uses audio '{audio_name or 'unknown'}', expected '{submission['campaign_song']}'."
            )
    else:
        result.passed = False
        result.reasons.append("Campaign has no song or audio link set, so the audio can't be checked.")
    return result


def verify_pending(db: Database, fetcher, notifier: Notifier | None = None) -> dict:
    """Check every pending reel. Returns counts; sends one Telegram summary if anything failed."""
    if not _run_lock.acquire(blocking=False):
        log.info("Reel check already running; skipping")
        return {"passed": 0, "failed": 0, "error": 0}
    try:
        return _verify_pending(db, fetcher, notifier)
    finally:
        _run_lock.release()


def _verify_pending(db: Database, fetcher, notifier: Notifier | None) -> dict:
    pending = db.pending_verification(BATCH_SIZE)
    counts = {"passed": 0, "failed": 0, "error": 0}
    if not pending:
        return counts
    try:
        items = fetcher.fetch([s["reel_url"] for s in pending])
    except Exception as exc:  # network/Apify problem: keep them pending for the next run
        log.exception("Reel fetch failed")
        for s in pending:
            db.record_verification(s["id"], "error", f"Check couldn't run: {type(exc).__name__}")
        counts["error"] = len(pending)
        return counts

    failures = []
    for s in pending:
        res = check_reel(s, items.get(shortcode(s["reel_url"])))
        status = "passed" if res.passed else "failed"
        db.record_verification(
            s["id"], status, " ".join(res.reasons), views=res.views, likes=res.likes,
            comments=res.comments, audio_name=res.audio_name, approve=res.passed,
        )
        counts[status] += 1
        if not res.passed:
            failures.append(f"   • @{s['ig_handle']} · {s['campaign_name']}: {' '.join(res.reasons)}")

    if failures and notifier is not None:
        notifier.send(
            f"🎬 Reel check: {counts['passed']} approved, {counts['failed']} need review\n"
            + "\n".join(failures[:15])
        )
    return counts


def main() -> None:
    fetcher = ApifyReelFetcher.from_env()
    if fetcher is None:
        raise SystemExit("Set APIFY_TOKEN to verify reels.")
    db = Database(os.environ.get("PRAABHAAV_DB", "praabhaav.db"))
    print(verify_pending(db, fetcher, Notifier.from_env()))


if __name__ == "__main__":
    main()
