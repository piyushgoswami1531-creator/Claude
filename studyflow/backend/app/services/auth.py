"""Password hashing and session tokens.

- Passwords: scrypt (Python stdlib, memory-hard) with a random per-user salt.
- Sessions: a signed JWT in an httpOnly, SameSite=Lax cookie, so JavaScript can't
  read it (XSS can't steal it) and other sites can't send it (CSRF).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import jwt

from ..config import get_settings

COOKIE_NAME = "sf_session"
_SCRYPT = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_b64, digest_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(digest_b64)
        actual = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64), **_SCRYPT)
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# A valid hash to check against when the email doesn't exist, so response time
# doesn't reveal which emails are registered.
DUMMY_HASH = hash_password("not-a-real-password")


def create_token(user_id: int) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(days=s.session_days)}
    return jwt.encode(payload, s.session_secret, algorithm="HS256")


def read_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, get_settings().session_secret, algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


class LoginThrottle:
    """At most `limit` failed logins per key per `window` seconds (in-memory, per process)."""

    def __init__(self, limit: int = 8, window: int = 300):
        self.limit, self.window = limit, window
        self._fails: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        q = self._fails[key]
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._prune(key, time.monotonic())) >= self.limit

    def fail(self, key: str) -> None:
        with self._lock:
            now = time.monotonic()
            self._prune(key, now).append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._fails.pop(key, None)


login_throttle = LoginThrottle()
