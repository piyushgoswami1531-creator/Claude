"""Shared web plumbing: app context, sessions and access checks, template helpers."""

import os
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.templating import Jinja2Templates

from . import auth
from .agent import QueryAgent
from .db import IST, Database, inr, is_overdue
from .notify import Notifier, configured_base_url
from .tracker import Jobs

BASE_DIR = Path(__file__).resolve().parent

STATUS_MESSAGES = {
    "submitted": "We've received your reel. Our team will verify it shortly.",
    "approved": "Your reel is approved and your payment is in the queue.",
    "scheduled": "Your payment is scheduled and will be sent soon.",
    "paid": "Paid! Please check your UPI app.",
    "issue": "There's a problem with this submission. See the note below, "
             "or message us on WhatsApp.",
}


def format_ist(value: str | None) -> str:
    if not value:
        return ""
    return datetime.fromisoformat(value).astimezone(IST).strftime("%d %b %Y, %I:%M %p")


def compact(n) -> str:
    """12500 -> '12.5K', 1530000 -> '1.5M' (for followers and views)."""
    if n is None:
        return "–"
    for div, suffix in ((1e6, "M"), (1e3, "K")):
        if abs(n) >= div:
            return f"{n / div:.1f}".rstrip("0").rstrip(".") + suffix
    return str(n)


def csv_safe(value):
    """Stop spreadsheet apps from running text like '=HYPERLINK(...)' as a formula."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@"):
        return "'" + value
    return value


class LoginRequired(Exception):
    """Raised when a host page is opened without a host session."""


@dataclass
class Ctx:
    db: Database
    agent: QueryAgent
    notifier: Notifier
    fetcher: object | None
    signer: auth.SessionSigner
    jobs: Jobs = field(default_factory=Jobs)
    templates: Jinja2Templates = None

    def __post_init__(self):
        self.templates = Jinja2Templates(
            directory=BASE_DIR / "templates", context_processors=[self._viewer]
        )
        env = self.templates.env
        env.filters["ist"] = format_ist
        env.filters["inr"] = inr
        env.filters["compact"] = compact
        env.globals["is_overdue"] = is_overdue
        env.globals["STATUS_MESSAGES"] = STATUS_MESSAGES

    def render(self, request: Request, name: str, context: dict | None = None,
               status_code: int = 200):
        return self.templates.TemplateResponse(request, name, context or {},
                                               status_code=status_code)

    def public_url(self, request: Request) -> str:
        return configured_base_url() or str(request.base_url).rstrip("/")

    # --- sessions ------------------------------------------------------------

    def session(self, request: Request) -> dict | None:
        return self.signer.loads(request.cookies.get(auth.COOKIE_NAME))

    def start_session(self, request: Request, response, data: dict, max_age: int) -> None:
        auth.set_session(response, self.signer, data, max_age,
                         secure=request.url.scheme == "https")

    def _viewer(self, request: Request) -> dict:
        return {"viewer_host": self.current_host(request),
                "viewer_creator": self.current_creator(request)}

    # --- hosts ---------------------------------------------------------------

    @staticmethod
    def owner_username() -> str:
        return os.environ.get("ADMIN_USER", "admin")

    def is_owner(self, username: str | None) -> bool:
        return bool(username) and username == self.owner_username() and bool(
            os.environ.get("ADMIN_PASSWORD"))

    def host_login_possible(self) -> bool:
        return bool(os.environ.get("ADMIN_PASSWORD")) or bool(self.db.list_hosts())

    def check_host_password(self, username: str, password: str) -> str:
        """Returns '' on success, otherwise an error message. Applies lockouts."""
        username = username.strip().lower()
        key = f"host:{username}"
        now = time.time()
        if self.db.is_locked(key, now):
            return "Too many wrong attempts. Try again in 15 minutes."
        env_pw = os.environ.get("ADMIN_PASSWORD")
        ok = False
        if env_pw and username == self.owner_username().lower():
            ok = secrets.compare_digest(password.encode(), env_pw.encode())
        else:
            host = self.db.get_host(username)
            ok = bool(host) and auth.verify_secret(password, host["pw_hash"])
        if not ok:
            self.db.record_login_failure(key, now, auth.MAX_FAILURES, auth.LOCKOUT_SECONDS)
            return "Wrong username or password."
        self.db.clear_login_failures(key)
        return ""

    def current_host(self, request: Request) -> str | None:
        s = self.session(request)
        if not s or s.get("role") != "host":
            return None
        user = s.get("user", "")
        # A removed team member loses access immediately.
        if self.is_owner(user) or self.db.get_host(user):
            return user
        return None

    def require_host(self, request: Request) -> str:
        """FastAPI dependency for host-only pages and actions."""
        user = self.current_host(request)
        if user:
            return user
        # HTTP Basic is still accepted for scripts (e.g. curl backups).
        header = request.headers.get("authorization", "")
        if header.lower().startswith("basic "):
            import base64
            try:
                username, _, password = base64.b64decode(header[6:]).decode().partition(":")
            except ValueError:
                username, password = "", ""
            if username and not self.check_host_password(username, password):
                return username.strip().lower()
            raise HTTPException(401, "Wrong username or password")
        raise LoginRequired()

    # --- creators ------------------------------------------------------------

    def current_creator(self, request: Request) -> dict | None:
        s = self.session(request)
        if not s or s.get("role") != "creator":
            return None
        if not self.db.get_creator_account(s.get("handle", ""), s.get("phone", "")):
            return None
        return {"handle": s["handle"], "phone": s["phone"]}

    def check_creator_pin(self, handle: str, phone: str, pin: str) -> str:
        key = f"creator:{handle}:{phone}"
        now = time.time()
        if self.db.is_locked(key, now):
            return "Too many wrong PINs. Try again in 15 minutes."
        account = self.db.get_creator_account(handle, phone)
        if not account or not auth.verify_secret(pin, account["pin_hash"]):
            self.db.record_login_failure(key, now, auth.MAX_FAILURES, auth.LOCKOUT_SECONDS)
            return "Wrong PIN for this Instagram handle and number."
        self.db.clear_login_failures(key)
        return ""
