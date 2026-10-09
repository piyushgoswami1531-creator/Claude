import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
DEV_SECRET_FILE = BACKEND_DIR / ".secret_key"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    anthropic_api_key: str = ""
    claude_model: str = "claude-opus-5-5"
    # Force the offline demo AI even when a key is present (handy for UI work and tests).
    ai_mock: bool = False
    # Server-side refusal fallback (Claude API only). Disable if your account/proxy rejects it.
    ai_fallbacks: bool = True
    # Max Claude calls (parse / quiz / review) per user per day. 0 = unlimited.
    daily_ai_limit: int = 15

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'studyflow.db').as_posix()}"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Signs login sessions. Set a long random value in production.
    secret_key: str = ""
    # Send the session cookie over HTTPS only. Must be true in production.
    cookie_secure: bool = False
    session_days: int = 30

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        # Render/Heroku/Neon give "postgres://" or "postgresql://"; SQLAlchemy needs the driver name.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def ai_live(self) -> bool:
        return bool(self.anthropic_api_key.strip()) and not self.ai_mock

    @property
    def session_secret(self) -> str:
        if self.secret_key:
            return self.secret_key
        # Local dev convenience: generate once and keep it, so logins survive restarts.
        if not DEV_SECRET_FILE.exists():
            DEV_SECRET_FILE.write_text(secrets.token_urlsafe(48))
        return DEV_SECRET_FILE.read_text().strip()


@lru_cache
def get_settings() -> Settings:
    return Settings()
