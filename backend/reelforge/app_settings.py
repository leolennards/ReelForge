"""User preferences stored in the local database and editable from Settings."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .db import Database
from .planning.options import Quality

SETTINGS_KEY = "app_settings"


class AppSettings(BaseModel):
    theme: Literal["dark", "light", "system"] = "dark"
    output_dir: str | None = None  # None = the configured default output folder
    default_profile_id: str = "universal"
    default_audio_codec: Literal["auto", "aac", "ac3", "eac3"] = "auto"
    default_quality: Quality = "balanced"
    max_concurrent_jobs: int = Field(default=1, ge=1, le=4)
    hardware_acceleration: bool = False
    # "smallest_change" follows the recommendation; "max_compatibility" always
    # re-encodes video for the widest device support.
    processing_behaviour: Literal["smallest_change", "max_compatibility"] = "smallest_change"
    external_srt: bool = False
    delete_uploads_after_success: bool = True
    history_retention_days: Literal[0, 7, 30, 90, 365] = 0  # 0 = keep until cleared
    path_retention_days: Literal[1, 7, 30] = 7
    usb_size_check: bool = True


def load_app_settings(db: Database) -> AppSettings:
    stored = db.get_setting(SETTINGS_KEY) or {}
    try:
        return AppSettings.model_validate(stored)
    except ValueError:
        # Settings written by a different version that no longer validate:
        # fall back to defaults rather than refusing to start.
        return AppSettings()


def save_app_settings(db: Database, settings: AppSettings) -> None:
    db.set_setting(SETTINGS_KEY, settings.model_dump())
