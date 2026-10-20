"""SQLite persistence for imports, jobs (queue + history), profiles and settings.

Movie contents are never stored here, only metadata. Absolute file paths are
kept only as long as they are useful and are cleared by ``forget_old_paths``.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

MIGRATIONS: list[str] = [
    # 1: initial schema
    """
    CREATE TABLE media (
        id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('upload', 'library')),
        path TEXT,
        original_name TEXT NOT NULL,
        size INTEGER NOT NULL,
        extension TEXT NOT NULL,
        info_json TEXT,
        created_at TEXT NOT NULL,
        removed INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        media_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_path TEXT,
        source_size INTEGER NOT NULL,
        source_duration REAL,
        profile_id TEXT NOT NULL,
        profile_name TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        options_json TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        strategy TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL,
        message TEXT,
        error TEXT,
        output_name TEXT NOT NULL,
        output_dir TEXT,
        output_path TEXT,
        srt_path TEXT,
        temp_path TEXT,
        output_size INTEGER,
        validation_json TEXT,
        ready_json TEXT,
        dedupe_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        duration_seconds REAL,
        queue_hidden INTEGER NOT NULL DEFAULT 0,
        retry_of TEXT
    );
    CREATE INDEX jobs_status ON jobs(status);
    CREATE INDEX jobs_created ON jobs(created_at);
    CREATE TABLE profiles (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
    );
    """,
]

ACTIVE_STATUSES = ("queued", "running", "validating")
FINISHED_STATUSES = ("completed", "failed", "canceled", "interrupted")


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class Database:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._migrate()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self._conn.execute("BEGIN")
            try:
                yield self._conn
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise
            self._conn.execute("COMMIT")

    def _migrate(self) -> None:
        with self._lock:
            version = self._conn.execute("PRAGMA user_version").fetchone()[0]
            for i, script in enumerate(MIGRATIONS[version:], start=version + 1):
                self._conn.executescript(f"BEGIN;{script};PRAGMA user_version={i};COMMIT;")

    def query(self, sql: str, params: tuple | dict = ()) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(r) for r in self._conn.execute(sql, params).fetchall()]

    def one(self, sql: str, params: tuple | dict = ()) -> dict[str, Any] | None:
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def execute(self, sql: str, params: tuple | dict = ()) -> int:
        with self._lock:
            return self._conn.execute(sql, params).rowcount

    # --- media ---------------------------------------------------------

    def insert_media(self, row: dict[str, Any]) -> None:
        cols = ", ".join(row)
        marks = ", ".join(f":{k}" for k in row)
        self.execute(f"INSERT INTO media ({cols}) VALUES ({marks})", row)

    def get_media(self, media_id: str) -> dict[str, Any] | None:
        return self.one("SELECT * FROM media WHERE id = ? AND removed = 0", (media_id,))

    def list_media(self) -> list[dict[str, Any]]:
        return self.query("SELECT * FROM media WHERE removed = 0 ORDER BY created_at DESC")

    # --- jobs ----------------------------------------------------------

    def insert_job(self, row: dict[str, Any]) -> None:
        cols = ", ".join(row)
        marks = ", ".join(f":{k}" for k in row)
        self.execute(f"INSERT INTO jobs ({cols}) VALUES ({marks})", row)

    def update_job(self, job_id: str, **fields: Any) -> None:
        if not fields:
            return
        sets = ", ".join(f"{k} = :{k}" for k in fields)
        self.execute(f"UPDATE jobs SET {sets} WHERE id = :_id", {**fields, "_id": job_id})

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        return self.one("SELECT * FROM jobs WHERE id = ?", (job_id,))

    def forget_old_paths(self, days: int) -> None:
        """Clear absolute paths from finished jobs older than ``days``."""
        cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat(timespec="seconds")
        self.execute(
            "UPDATE jobs SET source_path = NULL, output_path = NULL, output_dir = NULL, "
            "srt_path = NULL, temp_path = NULL "
            f"WHERE status IN {FINISHED_STATUSES} AND finished_at IS NOT NULL AND finished_at < ?",
            (cutoff,),
        )

    def delete_old_history(self, days: int) -> None:
        cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat(timespec="seconds")
        self.execute(
            f"DELETE FROM jobs WHERE status IN {FINISHED_STATUSES} AND finished_at < ?",
            (cutoff,),
        )

    # --- profiles / settings -------------------------------------------

    def get_setting(self, key: str) -> Any:
        row = self.one("SELECT value_json FROM settings WHERE key = ?", (key,))
        return json.loads(row["value_json"]) if row else None

    def set_setting(self, key: str, value: Any) -> None:
        self.execute(
            "INSERT INTO settings (key, value_json) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
            (key, json.dumps(value)),
        )
