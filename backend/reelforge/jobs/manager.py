"""The conversion queue: schedules, runs, cancels and reports FFmpeg jobs."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sys
import time
import uuid
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..app_settings import AppSettings
from ..compat.engine import FAT32_MAX_FILE_BYTES, tv_ready_check
from ..compat.profiles import DeviceProfile
from ..config import Settings
from ..db import ACTIVE_STATUSES, Database, now_iso
from ..media.ffmpeg_tools import FFmpegStatus
from ..media.models import MediaInfo
from ..media.probe import ProbeError, probe
from ..paths import PathNotAllowed, free_space, remove_quietly, resolve_within, unique_path
from ..planning.command import build_command
from ..planning.options import ConversionOptions
from ..planning.planner import STRATEGY_LABELS, ConversionPlan, plan_conversion
from .progress import ProgressState
from .validate import validate_output

log = logging.getLogger(__name__)

TERMINATE_GRACE_SECONDS = 5
PROGRESS_EMIT_INTERVAL = 0.5


class JobError(Exception):
    """A job could not be created or started; the message is shown to the user."""


class DuplicateJobError(JobError):
    pass


def friendly_ffmpeg_error(stderr_lines: list[str]) -> str:
    text = "\n".join(stderr_lines)
    lowered = text.lower()
    if "no space left on device" in lowered:
        return "The output drive ran out of space. Free up space or choose another output folder."
    if "permission denied" in lowered or "operation not permitted" in lowered:
        return "ReelForge isn't allowed to write to the output folder. Choose a different folder."
    if "invalid data found" in lowered or "error while decoding" in lowered or "corrupt" in lowered:
        return (
            "FFmpeg found damaged data in the source file. The download may be incomplete; "
            "try downloading the movie again."
        )
    if "could not find tag for codec" in lowered or "not currently supported in container" in lowered:
        return (
            "One of the streams can't be stored in the chosen container. Try MKV or the recommended settings."
        )
    if "unknown encoder" in lowered or "encoder not found" in lowered:
        return "This FFmpeg build is missing a required encoder. Install a full FFmpeg build."
    last = next((line for line in reversed(stderr_lines) if line.strip()), "")
    return "FFmpeg stopped with an error." + (f" Details: {last[:300]}" if last else "")


def _seconds_text(seconds: float) -> str:
    hours, rem = divmod(int(seconds), 3600)
    return f"{hours}h {rem // 60}m" if hours else f"{rem // 60}m {rem % 60}s"


class JobManager:
    def __init__(
        self,
        settings: Settings,
        db: Database,
        ffmpeg: FFmpegStatus,
        app_settings: Callable[[], AppSettings],
    ):
        self.settings = settings
        self.db = db
        self.ffmpeg = ffmpeg
        self.app_settings = app_settings
        self._tasks: dict[str, asyncio.Task] = {}
        self._procs: dict[str, asyncio.subprocess.Process] = {}
        self._cancel: dict[str, asyncio.Event] = {}
        self._live: dict[str, dict[str, Any]] = {}
        self._last_emit: dict[str, float] = {}
        self._subscribers: set[asyncio.Queue] = set()
        self._wake = asyncio.Event()
        self._scheduler: asyncio.Task | None = None
        self._create_lock = asyncio.Lock()

    # --- lifecycle --------------------------------------------------------

    async def start(self) -> None:
        self.recover_interrupted()
        self._scheduler = asyncio.create_task(self._schedule_loop(), name="job-scheduler")
        self._wake.set()

    async def stop(self) -> None:
        if self._scheduler:
            self._scheduler.cancel()
        # Cancelling the tasks terminates their FFmpeg processes (see _run's
        # finally block); the rows are then marked as interrupted.
        tasks = list(self._tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.recover_interrupted()

    def recover_interrupted(self) -> None:
        """Jobs left 'running' by a crash or restart can't be resumed mid-file."""
        for job in self.db.query(
            "SELECT id, temp_path, srt_path FROM jobs WHERE status IN ('running', 'validating')"
        ):
            if job["temp_path"]:
                remove_quietly(Path(job["temp_path"]))
                remove_quietly(Path(job["temp_path"] + ".srt"))
            self.db.update_job(
                job["id"],
                status="interrupted",
                finished_at=now_iso(),
                temp_path=None,
                error=(
                    "ReelForge stopped while this conversion was running. The partial file was "
                    "removed. Retry to convert it again from the beginning."
                ),
            )

    # --- events -----------------------------------------------------------

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)

    def _publish(self, job_id: str, force: bool = True) -> None:
        now = time.monotonic()
        if not force and now - self._last_emit.get(job_id, 0) < PROGRESS_EMIT_INTERVAL:
            return
        self._last_emit[job_id] = now
        row = self.db.get_job(job_id)
        if row is None:
            event = {"type": "job_removed", "id": job_id}
        else:
            event = {"type": "job", "job": self.public_job(row)}
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # A stalled client; it will resync from the snapshot on reconnect.
                self._subscribers.discard(queue)

    # --- public views -----------------------------------------------------

    def public_job(self, row: dict[str, Any]) -> dict[str, Any]:
        plan = json.loads(row["plan_json"])
        live = self._live.get(row["id"], {})
        output_path = row.get("output_path")
        return {
            "id": row["id"],
            "media_id": row["media_id"],
            "source_name": row["source_name"],
            "source_size": row["source_size"],
            "profile_id": row["profile_id"],
            "profile_name": row["profile_name"],
            "strategy": row["strategy"],
            "strategy_label": STRATEGY_LABELS.get(row["strategy"], row["strategy"]),
            "status": row["status"],
            "progress": row["progress"],
            "eta_seconds": live.get("eta_seconds"),
            "speed": live.get("speed"),
            "message": row["message"],
            "error": row["error"],
            "output_name": row["output_name"],
            "output_path": output_path,
            "output_dir": row["output_dir"],
            "output_available": bool(output_path and os.path.exists(output_path)),
            "srt_available": bool(row.get("srt_path") and os.path.exists(row["srt_path"])),
            "output_size": row["output_size"],
            "created_at": row["created_at"],
            "started_at": row["started_at"],
            "finished_at": row["finished_at"],
            "duration_seconds": row["duration_seconds"],
            "validation": json.loads(row["validation_json"]) if row["validation_json"] else None,
            "ready": json.loads(row["ready_json"]) if row["ready_json"] else None,
            "plan": {
                "summary": plan.get("summary"),
                "container": plan.get("container"),
                "changes": plan.get("changes", []),
                "keeps": plan.get("keeps", []),
                "warnings": plan.get("warnings", []),
            },
            "options": json.loads(row["options_json"]),
            "queue_hidden": bool(row["queue_hidden"]),
            "retry_of": row["retry_of"],
        }

    def list_jobs(self, include_hidden: bool = False) -> list[dict[str, Any]]:
        sql = "SELECT * FROM jobs"
        if not include_hidden:
            sql += " WHERE queue_hidden = 0"
        return [self.public_job(r) for r in self.db.query(sql + " ORDER BY created_at DESC")]

    # --- creating jobs ----------------------------------------------------

    def build_plan(
        self, info: MediaInfo, profile: DeviceProfile, options: ConversionOptions
    ) -> ConversionPlan:
        return plan_conversion(info, profile, options, self.ffmpeg.encoders, self.ffmpeg.hardware_encoders)

    async def create_job(
        self,
        media: dict[str, Any],
        profile: DeviceProfile,
        options: ConversionOptions,
        output_dir: Path,
        output_name: str,
        retry_of: str | None = None,
    ) -> dict[str, Any]:
        if not self.ffmpeg.available:
            raise JobError("FFmpeg isn't available, so conversions can't run yet.")
        if not media.get("info_json") or not media.get("path"):
            raise JobError("This movie hasn't been analysed successfully, so it can't be converted.")
        info = MediaInfo.model_validate_json(media["info_json"])
        plan = self.build_plan(info, profile, options)
        if not plan.needed:
            raise JobError(
                "No conversion is needed for this profile. Choose “Remux” or “Custom” if you "
                "still want a converted copy."
            )
        if plan.errors:
            raise JobError(plan.errors[0])

        key_source = json.dumps(
            [media["id"], profile.model_dump(), options.model_dump(), str(output_dir), output_name],
            sort_keys=True,
        )
        dedupe_key = hashlib.sha256(key_source.encode()).hexdigest()
        async with self._create_lock:
            duplicate = self.db.one(
                f"SELECT id FROM jobs WHERE dedupe_key = ? AND status IN {ACTIVE_STATUSES}",
                (dedupe_key,),
            )
            if duplicate:
                raise DuplicateJobError("This exact conversion is already in the queue.")
            job_id = uuid.uuid4().hex[:12]
            self.db.insert_job(
                {
                    "id": job_id,
                    "media_id": media["id"],
                    "source_name": media["original_name"],
                    "source_path": media["path"],
                    "source_size": media["size"],
                    "source_duration": info.duration,
                    "profile_id": profile.id,
                    "profile_name": profile.name,
                    "profile_json": profile.model_dump_json(),
                    "options_json": options.model_dump_json(),
                    "plan_json": plan.model_dump_json(),
                    "strategy": plan.strategy,
                    "status": "queued",
                    "progress": 0.0,
                    "message": "Waiting in queue",
                    "output_name": output_name,
                    "output_dir": str(output_dir),
                    "dedupe_key": dedupe_key,
                    "created_at": now_iso(),
                    "retry_of": retry_of,
                }
            )
        log.info("job queued", extra={"job_id": job_id, "strategy": plan.strategy})
        self._publish(job_id)
        self._wake.set()
        row = self.db.get_job(job_id)
        assert row is not None
        return self.public_job(row)

    # --- controlling jobs -------------------------------------------------

    async def cancel(self, job_id: str) -> None:
        row = self.db.get_job(job_id)
        if row is None:
            raise JobError("That job doesn't exist.")
        if row["status"] == "queued":
            self.db.update_job(
                job_id, status="canceled", finished_at=now_iso(), message="Canceled before starting"
            )
            self._publish(job_id)
            return
        if row["status"] not in ("running", "validating"):
            raise JobError("Only queued or running jobs can be canceled.")
        self._cancel.setdefault(job_id, asyncio.Event()).set()
        await self._terminate(job_id)

    def hide(self, job_id: str) -> None:
        row = self.db.get_job(job_id)
        if row is None:
            raise JobError("That job doesn't exist.")
        if row["status"] in ACTIVE_STATUSES:
            raise JobError("Cancel the job before removing it from the queue.")
        self.db.update_job(job_id, queue_hidden=1)
        self._publish(job_id)

    def delete_record(self, job_id: str) -> None:
        row = self.db.get_job(job_id)
        if row is None:
            raise JobError("That record doesn't exist.")
        if row["status"] in ACTIVE_STATUSES:
            raise JobError("Cancel the job before deleting its record.")
        self.db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        self._publish(job_id)

    def clear_history(self) -> int:
        removed = self.db.query(f"SELECT id FROM jobs WHERE status NOT IN {ACTIVE_STATUSES}")
        self.db.execute(f"DELETE FROM jobs WHERE status NOT IN {ACTIVE_STATUSES}")
        for r in removed:
            self._publish(r["id"])
        return len(removed)

    async def _terminate(self, job_id: str) -> None:
        proc = self._procs.get(job_id)
        if proc is None or proc.returncode is not None:
            return
        try:
            proc.terminate()
        except ProcessLookupError:
            return
        try:
            await asyncio.wait_for(proc.wait(), TERMINATE_GRACE_SECONDS)
        except TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            await proc.wait()

    # --- scheduling -------------------------------------------------------

    async def _schedule_loop(self) -> None:
        while True:
            await self._wake.wait()
            self._wake.clear()
            try:
                self._fill_slots()
            except Exception:  # noqa: BLE001 - the scheduler must never die
                log.exception("scheduler error")

    def _fill_slots(self) -> None:
        limit = self.app_settings().max_concurrent_jobs
        free = limit - len(self._tasks)
        if free <= 0:
            return
        for row in self.db.query(
            "SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?", (free,)
        ):
            job_id = row["id"]
            self.db.update_job(job_id, status="running", message="Starting", started_at=now_iso())
            self._cancel[job_id] = asyncio.Event()
            task = asyncio.create_task(self._run_guarded(job_id), name=f"job-{job_id}")
            self._tasks[job_id] = task

    async def _run_guarded(self, job_id: str) -> None:
        try:
            await self._run(job_id)
        except asyncio.CancelledError:
            raise
        except JobError as exc:
            self._fail(job_id, str(exc))
        except Exception:
            log.exception("job crashed", extra={"job_id": job_id})
            self._fail(job_id, "An unexpected error stopped this conversion. See the logs for details.")
        finally:
            self._tasks.pop(job_id, None)
            self._procs.pop(job_id, None)
            self._cancel.pop(job_id, None)
            self._live.pop(job_id, None)
            self._last_emit.pop(job_id, None)
            self._wake.set()

    def _fail(self, job_id: str, message: str, status: str = "failed") -> None:
        row = self.db.get_job(job_id)
        if row and row["temp_path"]:
            remove_quietly(Path(row["temp_path"]))
            remove_quietly(Path(row["temp_path"] + ".srt"))
        started = row["started_at"] if row else None
        self.db.update_job(
            job_id,
            status=status,
            error=None if status == "canceled" else message,
            message=message if status == "canceled" else "Failed",
            finished_at=now_iso(),
            temp_path=None,
            duration_seconds=_elapsed(started),
        )
        log.info("job ended", extra={"job_id": job_id, "status": status})
        self._publish(job_id)

    # --- running ----------------------------------------------------------

    async def _run(self, job_id: str) -> None:
        row = self.db.get_job(job_id)
        assert row is not None
        plan = ConversionPlan.model_validate_json(row["plan_json"])
        profile = DeviceProfile.model_validate_json(row["profile_json"])
        media = self.db.one("SELECT * FROM media WHERE id = ?", (row["media_id"],))
        if not row["source_path"] or media is None or not media["info_json"]:
            raise JobError("The source movie is no longer available. Import it again to convert it.")
        source = Path(row["source_path"])
        source_info = MediaInfo.model_validate_json(media["info_json"])
        if not source.is_file():
            raise JobError("The source file has been moved or deleted since it was imported.")

        try:
            out_dir = resolve_within(Path(row["output_dir"]), self.settings.output_roots)
        except PathNotAllowed as exc:
            raise JobError(str(exc)) from exc
        try:
            await asyncio.to_thread(out_dir.mkdir, parents=True, exist_ok=True)
        except OSError as exc:
            raise JobError(f"The output folder couldn't be created: {exc.strerror}") from exc

        needed = (plan.estimated_size or int(row["source_size"] * 1.1)) + self.settings.min_free_bytes
        available = free_space(out_dir)
        if available < needed:
            raise JobError(
                f"Not enough free space in the output folder: about {needed / 1024**3:.1f} GB is "
                f"needed and {available / 1024**3:.1f} GB is free. Nothing was written."
            )

        temp = out_dir / f".reelforge-{job_id}.partial{plan.extension}"
        srt_temp = Path(str(temp) + ".srt") if plan.external_srt_index is not None else None
        argv = build_command(self.ffmpeg.ffmpeg_path or "ffmpeg", source, plan, temp, srt_temp)
        self.db.update_job(job_id, temp_path=str(temp), message="Converting", progress=0.0)
        self._publish(job_id)

        cancel_event = self._cancel.setdefault(job_id, asyncio.Event())
        state = ProgressState(duration=row["source_duration"])
        stderr_tail: deque[str] = deque(maxlen=40)
        kwargs: dict[str, Any] = {}
        if sys.platform == "win32":
            import subprocess

            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        log.info("ffmpeg start", extra={"job_id": job_id, "strategy": plan.strategy})
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            **kwargs,
        )
        self._procs[job_id] = proc

        async def read_progress() -> None:
            assert proc.stdout is not None
            async for raw in proc.stdout:
                if state.feed(raw.decode(errors="replace")):
                    pct = state.percent
                    self._live[job_id] = {"eta_seconds": state.eta_seconds, "speed": state.speed}
                    self.db.update_job(job_id, progress=pct)
                    self._publish(job_id, force=False)

        async def read_stderr() -> None:
            assert proc.stderr is not None
            async for raw in proc.stderr:
                stderr_tail.append(raw.decode(errors="replace").rstrip())

        readers = asyncio.gather(read_progress(), read_stderr())
        stop_reason: str | None = None
        started = time.monotonic()
        try:
            while proc.returncode is None:
                try:
                    await asyncio.wait_for(asyncio.shield(proc.wait()), 1.0)
                except TimeoutError:
                    pass
                if proc.returncode is not None:
                    break
                if cancel_event.is_set():
                    stop_reason = "canceled"
                elif time.monotonic() - started > self.settings.job_timeout_seconds:
                    stop_reason = (
                        f"The conversion exceeded the time limit of "
                        f"{_seconds_text(self.settings.job_timeout_seconds)} and was stopped."
                    )
                elif time.monotonic() - state.last_change_at > self.settings.stall_timeout_seconds:
                    stop_reason = (
                        "FFmpeg stopped making progress and the conversion was stopped. The source "
                        "file may be damaged."
                    )
                if stop_reason:
                    await self._terminate(job_id)
                    break
        finally:
            if proc.returncode is None:
                await self._terminate(job_id)
            await readers

        if cancel_event.is_set() or stop_reason == "canceled":
            self._fail(job_id, "Canceled by you. The partial file was removed.", status="canceled")
            return
        if stop_reason:
            raise JobError(stop_reason)
        if proc.returncode != 0:
            log.info("ffmpeg failed", extra={"job_id": job_id, "code": proc.returncode})
            raise JobError(friendly_ffmpeg_error(list(stderr_tail)))

        # --- validate and finalise ---
        self.db.update_job(job_id, status="validating", message="Checking the converted file", progress=100.0)
        self._live.pop(job_id, None)
        self._publish(job_id)
        try:
            output_info = await probe(self.ffmpeg.ffprobe_path or "ffprobe", temp)
        except ProbeError as exc:
            raise JobError(f"The converted file couldn't be inspected: {exc}") from exc
        validation = validate_output(source_info, output_info, plan)
        if not validation.ok:
            failed = "; ".join(c.detail for c in validation.checks if not c.ok)
            remove_quietly(temp)
            remove_quietly(srt_temp)
            self.db.update_job(job_id, validation_json=validation.model_dump_json())
            raise JobError(f"Output validation failed, so the file was discarded: {failed}")

        final = unique_path(out_dir, row["output_name"], plan.extension)
        os.replace(temp, final)
        srt_final: Path | None = None
        if srt_temp is not None and srt_temp.exists():
            srt_final = unique_path(out_dir, final.stem, ".srt")
            os.replace(srt_temp, srt_final)

        output_info.size = final.stat().st_size
        app = self.app_settings()
        ready = tv_ready_check(output_info, profile, FAT32_MAX_FILE_BYTES if app.usb_size_check else None)
        self.db.update_job(
            job_id,
            status="completed",
            message="Done",
            progress=100.0,
            error=None,
            temp_path=None,
            output_path=str(final),
            output_name=final.stem,
            srt_path=str(srt_final) if srt_final else None,
            output_size=output_info.size,
            validation_json=validation.model_dump_json(),
            ready_json=json.dumps([item.model_dump() for item in ready]),
            finished_at=now_iso(),
            duration_seconds=_elapsed(row["started_at"]),
        )
        log.info("job completed", extra={"job_id": job_id, "size": output_info.size})
        self._publish(job_id)
        if app.delete_uploads_after_success:
            self._cleanup_upload(row["media_id"])

    def _cleanup_upload(self, media_id: str) -> None:
        media = self.db.one("SELECT * FROM media WHERE id = ?", (media_id,))
        if media is None or media["source_kind"] != "upload" or not media["path"]:
            return
        pending = self.db.one(
            f"SELECT id FROM jobs WHERE media_id = ? AND status IN {ACTIVE_STATUSES}", (media_id,)
        )
        if pending:
            return
        path = Path(media["path"])
        remove_quietly(path)
        try:
            path.parent.rmdir()
        except OSError:
            pass
        self.db.execute("UPDATE media SET removed = 1, path = NULL WHERE id = ?", (media_id,))


def _elapsed(started_iso: str | None) -> float | None:
    if not started_iso:
        return None
    started = datetime.fromisoformat(started_iso)
    return round((datetime.now(UTC) - started).total_seconds(), 1)
