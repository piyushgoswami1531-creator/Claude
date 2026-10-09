from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent


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
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'studyflow.db').as_posix()}"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def ai_live(self) -> bool:
        return bool(self.anthropic_api_key.strip()) and not self.ai_mock


@lru_cache
def get_settings() -> Settings:
    return Settings()
