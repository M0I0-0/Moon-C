"""Runtime settings.

Every setting can be overridden with an environment variable prefixed with
``MOON_C_`` (for example ``MOON_C_OLLAMA_MODEL``) or with a ``backend/.env`` file.
Relative paths are resolved against the backend folder.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent

DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173,http://localhost:3000,"
    "http://127.0.0.1:5173,http://127.0.0.1:3000"
)
DEFAULT_CORS_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


class Settings(BaseSettings):
    """Moon-C settings with safe offline defaults."""

    model_config = SettingsConfigDict(
        env_prefix="MOON_C_",
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Ollama: used for small talk only.
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3.5:4b"
    ollama_timeout_s: float = Field(10.0, gt=0)
    ollama_keep_alive: str = "30m"
    ollama_num_predict: int = Field(120, gt=0)
    ollama_temperature: float = Field(0.7, ge=0, le=2)
    ollama_warmup: bool = True
    ollama_warmup_timeout_s: float = Field(180.0, gt=0)
    ollama_status_timeout_s: float = Field(2.0, gt=0)

    # Data.
    shared_dir: Path = REPO_DIR / "shared"
    profiles_dir: Path | None = Field(
        None, description="Private support profiles (one JSON per crew member). Default: <shared_dir>/profiles"
    )
    storage_path: Path = BACKEND_DIR / "storage" / "measurements.json"
    retention_days: int = Field(0, ge=0, description="0 = keep for the whole mission")

    # Chat sessions (memory only).
    session_ttl_s: int = Field(600, gt=0)
    session_max_turns: int = Field(10, gt=0)
    session_sweep_interval_s: float = Field(60.0, gt=0)

    # Earth link (simulated).
    earth_link: Literal["offline", "online"] = "offline"
    sync_interval_s: float = Field(60.0, gt=0)

    # Simulated bracelets (there are no real sensors yet).
    simulation: bool = True
    sim_tick_s: float = Field(2.5, gt=0, description="Seconds between simulated readings")
    snapshot_interval_s: float = Field(900.0, gt=0, description="Seconds between stored snapshots of live signs")
    sim_seed: int | None = Field(None, description="Fixed random seed, for reproducible demos")

    # Moon-C's own voice (offline text-to-speech, optional install: requirements-voice.txt).
    voice: bool = True
    voice_dir: Path = REPO_DIR / "moonc_voz"

    # CORS.
    cors_origins: str = DEFAULT_CORS_ORIGINS
    cors_origin_regex: str | None = DEFAULT_CORS_ORIGIN_REGEX

    @field_validator("shared_dir", "storage_path", "voice_dir", "profiles_dir", mode="after")
    @classmethod
    def _resolve_relative(cls, value: Path | None) -> Path | None:
        if value is None:
            return None
        return value if value.is_absolute() else (BACKEND_DIR / value).resolve()

    @field_validator("cors_origin_regex", mode="after")
    @classmethod
    def _empty_regex_is_none(cls, value: str | None) -> str | None:
        return value or None

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


def get_settings() -> Settings:
    return Settings()
