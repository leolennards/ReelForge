"""Runtime configuration, read once from environment variables.

Every value has a safe default so the app runs without any configuration.
See `.env.example` at the repository root for the full list.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

APP_NAME = "ReelForge"
APP_VERSION = "0.1.0"

GIB = 1024**3


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(f"REELFORGE_{name}")
    if value is None or value.strip() == "":
        return default
    return value.strip()


def _env_float(name: str, default: float) -> float:
    raw = _env(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"REELFORGE_{name} must be a number, got {raw!r}") from exc


def _env_paths(name: str, default: list[Path]) -> list[Path]:
    raw = _env(name)
    if raw is None:
        return default
    return [Path(p).expanduser() for p in raw.split(os.pathsep) if p.strip()]


def _default_data_dir() -> Path:
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / APP_NAME
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA")
        return Path(base) / APP_NAME if base else home / APP_NAME
    xdg = os.environ.get("XDG_DATA_HOME")
    return (Path(xdg) if xdg else home / ".local" / "share") / "reelforge"


def _default_media_dirs() -> list[Path]:
    home = Path.home()
    candidates = [home / "Movies", home / "Videos", home / "Downloads", home / "Desktop"]
    return [p for p in candidates if p.is_dir()] or [home]


def _default_output_dir() -> Path:
    home = Path.home()
    movies = home / "Movies" if (home / "Movies").is_dir() else home / "Videos"
    return (movies if movies.is_dir() else home) / APP_NAME


@dataclass(frozen=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 8765
    data_dir: Path = field(default_factory=_default_data_dir)
    # Folders the library browser may list and read movies from.
    media_dirs: list[Path] = field(default_factory=_default_media_dirs)
    # Folders that converted files may be written into (and their subfolders).
    output_roots: list[Path] = field(default_factory=lambda: [Path.home()])
    default_output_dir: Path = field(default_factory=_default_output_dir)
    allowed_origins: list[str] = field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    max_upload_bytes: int = 100 * GIB
    min_free_bytes: int = 1 * GIB
    job_timeout_seconds: float = 12 * 3600
    stall_timeout_seconds: float = 10 * 60
    ffmpeg_path: str | None = None
    ffprobe_path: str | None = None
    allow_remote: bool = False

    @property
    def db_path(self) -> Path:
        return self.data_dir / "reelforge.sqlite3"

    @property
    def upload_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def log_dir(self) -> Path:
        return self.data_dir / "logs"


def load_settings() -> Settings:
    defaults = Settings()
    origins = _env("ALLOWED_ORIGINS")
    return Settings(
        host=_env("HOST", defaults.host) or defaults.host,
        port=int(_env_float("PORT", defaults.port)),
        data_dir=Path(_env("DATA_DIR", str(defaults.data_dir)) or "").expanduser(),
        media_dirs=_env_paths("MEDIA_DIRS", defaults.media_dirs),
        output_roots=_env_paths("OUTPUT_ROOTS", defaults.output_roots),
        default_output_dir=Path(_env("OUTPUT_DIR", str(defaults.default_output_dir)) or "").expanduser(),
        allowed_origins=[o.strip() for o in origins.split(",") if o.strip()]
        if origins
        else defaults.allowed_origins,
        max_upload_bytes=int(_env_float("MAX_UPLOAD_GB", 100) * GIB),
        min_free_bytes=int(_env_float("MIN_FREE_GB", 1) * GIB),
        job_timeout_seconds=_env_float("JOB_TIMEOUT_HOURS", 12) * 3600,
        stall_timeout_seconds=_env_float("STALL_TIMEOUT_MINUTES", 10) * 60,
        ffmpeg_path=_env("FFMPEG_PATH"),
        ffprobe_path=_env("FFPROBE_PATH"),
        allow_remote=(_env("ALLOW_REMOTE", "0") or "0").lower() in {"1", "true", "yes"},
    )
