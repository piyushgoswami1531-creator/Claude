"""Logins for hosts (the Praabhaav team) and creators.

- Passwords and PINs are stored as salted PBKDF2 hashes, never in plain text.
- Sessions live in a signed, HttpOnly, SameSite=Lax cookie. SameSite=Lax stops
  other sites from making logged-in POST requests (basic CSRF protection).
- Repeated wrong passwords/PINs lock that login for a while.

Set SECRET_KEY in production so sessions survive restarts.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time

log = logging.getLogger(__name__)

COOKIE_NAME = "pb_session"
HOST_SESSION_SECONDS = 7 * 24 * 3600
CREATOR_SESSION_SECONDS = 30 * 24 * 3600
MAX_FAILURES = 5
LOCKOUT_SECONDS = 15 * 60
_ITERATIONS = 200_000


def hash_secret(secret: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, _ITERATIONS)
    return f"pbkdf2${_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_secret(secret: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$")
        candidate = hashlib.pbkdf2_hmac(
            "sha256", secret.encode(), bytes.fromhex(salt), int(iterations)
        )
        return hmac.compare_digest(candidate.hex(), digest)
    except (ValueError, TypeError):
        return False


class SessionSigner:
    def __init__(self, secret_key: str | None = None):
        if not secret_key:
            log.warning("SECRET_KEY not set: using a random key, so logins reset on restart.")
            secret_key = secrets.token_hex(32)
        self.key = secret_key.encode()

    @classmethod
    def from_env(cls) -> "SessionSigner":
        return cls(os.environ.get("SECRET_KEY"))

    def _sign(self, payload: bytes) -> str:
        return hmac.new(self.key, payload, hashlib.sha256).hexdigest()

    def dumps(self, data: dict, max_age: int) -> str:
        payload = base64.urlsafe_b64encode(
            json.dumps({**data, "exp": int(time.time()) + max_age}).encode()
        )
        return f"{payload.decode()}.{self._sign(payload)}"

    def loads(self, token: str | None) -> dict | None:
        if not token or "." not in token:
            return None
        payload, sig = token.rsplit(".", 1)
        if not hmac.compare_digest(self._sign(payload.encode()), sig):
            return None
        try:
            data = json.loads(base64.urlsafe_b64decode(payload.encode()))
        except ValueError:
            return None
        if data.get("exp", 0) < time.time():
            return None
        return data


def set_session(response, signer: SessionSigner, data: dict, max_age: int, secure: bool) -> None:
    response.set_cookie(
        COOKIE_NAME, signer.dumps(data, max_age), max_age=max_age,
        httponly=True, samesite="lax", secure=secure,
    )


def clear_session(response) -> None:
    response.delete_cookie(COOKIE_NAME)
