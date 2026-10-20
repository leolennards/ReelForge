"""Shared application state handed to the API routes."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from .app_settings import AppSettings, load_app_settings, save_app_settings
from .compat.profiles import BUILTIN_BY_ID, BUILTIN_PROFILES, DeviceProfile
from .config import Settings
from .db import Database, now_iso
from .jobs.manager import JobManager
from .media.ffmpeg_tools import FFmpegStatus
from .paths import resolve_within


class ProfileError(Exception):
    pass


@dataclass
class AppState:
    settings: Settings
    db: Database
    ffmpeg: FFmpegStatus
    jobs: JobManager = field(init=False)
    _app_settings: AppSettings = field(init=False)

    def __post_init__(self) -> None:
        self._app_settings = load_app_settings(self.db)
        self.jobs = JobManager(self.settings, self.db, self.ffmpeg, lambda: self._app_settings)

    # --- preferences ---------------------------------------------------

    @property
    def app_settings(self) -> AppSettings:
        return self._app_settings

    def update_app_settings(self, new: AppSettings) -> AppSettings:
        if new.output_dir:
            resolve_within(Path(new.output_dir), self.settings.output_roots)
        self.get_profile(new.default_profile_id)
        save_app_settings(self.db, new)
        self._app_settings = new
        self.apply_retention()
        return new

    def apply_retention(self) -> None:
        s = self._app_settings
        self.db.forget_old_paths(s.path_retention_days)
        if s.history_retention_days:
            self.db.delete_old_history(s.history_retention_days)

    def output_dir(self, override: str | None = None) -> Path:
        chosen = override or self._app_settings.output_dir or str(self.settings.default_output_dir)
        return resolve_within(Path(chosen), self.settings.output_roots)

    # --- profiles --------------------------------------------------------

    def list_profiles(self) -> list[DeviceProfile]:
        custom = [
            DeviceProfile.model_validate_json(r["data_json"])
            for r in self.db.query("SELECT data_json FROM profiles ORDER BY updated_at DESC")
        ]
        return [*BUILTIN_PROFILES, *custom]

    def get_profile(self, profile_id: str) -> DeviceProfile:
        if profile_id in BUILTIN_BY_ID:
            return BUILTIN_BY_ID[profile_id]
        row = self.db.one("SELECT data_json FROM profiles WHERE id = ?", (profile_id,))
        if row is None:
            raise ProfileError("That device profile doesn't exist.")
        return DeviceProfile.model_validate_json(row["data_json"])

    def save_profile(self, profile: DeviceProfile) -> DeviceProfile:
        if profile.id in BUILTIN_BY_ID:
            raise ProfileError("Built-in profiles can't be changed. Duplicate it to customise it.")
        profile = profile.model_copy(update={"builtin": False})
        self.db.execute(
            "INSERT INTO profiles (id, data_json, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at",
            (profile.id, profile.model_dump_json(), now_iso()),
        )
        return profile

    def delete_profile(self, profile_id: str) -> None:
        if profile_id in BUILTIN_BY_ID:
            raise ProfileError("Built-in profiles can't be deleted.")
        if self.db.execute("DELETE FROM profiles WHERE id = ?", (profile_id,)) == 0:
            raise ProfileError("That device profile doesn't exist.")
        if self._app_settings.default_profile_id == profile_id:
            self.update_app_settings(
                self._app_settings.model_copy(update={"default_profile_id": "universal"})
            )

    def last_used_profile_id(self) -> str | None:
        row = self.db.one("SELECT profile_id FROM jobs ORDER BY created_at DESC LIMIT 1")
        return row["profile_id"] if row else None
