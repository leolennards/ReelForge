"""Planning, the conversion queue, history, downloads and live events."""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from ..compat.engine import assess
from ..compat.profiles import DeviceProfile
from ..db import FINISHED_STATUSES
from ..media.models import MediaInfo
from ..paths import resolve_within, safe_filename
from ..planning.command import build_command
from ..planning.options import ConversionOptions
from ..state import AppState
from .deps import get_state

router = APIRouter(prefix="/api", tags=["jobs"])


class PlanRequest(BaseModel):
    media_id: str = Field(min_length=1, max_length=64)
    profile_id: str = Field(min_length=1, max_length=48)
    options: ConversionOptions = ConversionOptions()


class JobRequest(PlanRequest):
    output_name: str | None = Field(default=None, max_length=200)
    output_dir: str | None = Field(default=None, max_length=4096)


class BatchRequest(BaseModel):
    media_ids: list[str] = Field(min_length=1, max_length=100)
    profile_id: str = Field(min_length=1, max_length=48)
    options: ConversionOptions = ConversionOptions()
    output_dir: str | None = Field(default=None, max_length=4096)


def _media_info(state: AppState, media_id: str) -> tuple[dict[str, Any], MediaInfo]:
    media = state.db.get_media(media_id)
    if media is None:
        raise HTTPException(404, "That movie isn't in the import list.")
    if not media["info_json"]:
        raise HTTPException(409, "This movie hasn't been analysed.")
    return media, MediaInfo.model_validate_json(media["info_json"])


def _apply_behaviour(state: AppState, options: ConversionOptions) -> ConversionOptions:
    """Fold the user's saved preferences into recommended-mode options."""
    prefs = state.app_settings
    updates: dict[str, Any] = {}
    if options.mode == "recommended" and prefs.processing_behaviour == "max_compatibility":
        updates["mode"] = "full"
    if options.audio_codec == "auto" and prefs.default_audio_codec != "auto":
        updates["audio_codec"] = prefs.default_audio_codec
    return options.model_copy(update=updates) if updates else options


def default_output_name(source_name: str) -> str:
    return safe_filename(f"{Path(source_name).stem} (TV)")


@router.post("/plan")
def plan(request: Request, body: PlanRequest) -> dict[str, Any]:
    state = get_state(request)
    media, info = _media_info(state, body.media_id)
    profile = state.get_profile(body.profile_id)
    options = _apply_behaviour(state, body.options)
    plan = state.jobs.build_plan(info, profile, options)
    preview: list[str] | None = None
    if plan.needed and not plan.errors:
        # Shown read-only to advanced users; file names are placeholders.
        preview = build_command(
            "ffmpeg",
            Path("input" + Path(media["original_name"]).suffix),
            plan,
            Path("output" + plan.extension),
            Path("output.srt") if plan.external_srt_index is not None else None,
        )
        preview = [a.removeprefix("file:") for a in preview]
    return {
        "media_id": media["id"],
        "profile": profile.model_dump(),
        "options": options.model_dump(),
        "compatibility": assess(info, profile).model_dump(),
        "plan": plan.model_dump(),
        "command_preview": preview,
        "default_output_name": default_output_name(media["original_name"]),
        "default_output_dir": str(state.output_dir()),
    }


@router.post("/jobs")
async def create_job(request: Request, body: JobRequest) -> dict[str, Any]:
    state = get_state(request)
    media, _ = _media_info(state, body.media_id)
    profile = state.get_profile(body.profile_id)
    options = _apply_behaviour(state, body.options)
    output_name = safe_filename(body.output_name or default_output_name(media["original_name"]))
    return await state.jobs.create_job(
        media, profile, options, state.output_dir(body.output_dir), output_name
    )


@router.post("/jobs/batch")
async def create_batch(request: Request, body: BatchRequest) -> dict[str, Any]:
    """Queue several movies with the same profile; each gets its own recommendation."""
    state = get_state(request)
    profile = state.get_profile(body.profile_id)
    options = _apply_behaviour(state, body.options)
    out_dir = state.output_dir(body.output_dir)
    created, skipped = [], []
    for media_id in dict.fromkeys(body.media_ids):
        media = state.db.get_media(media_id)
        if media is None:
            skipped.append({"media_id": media_id, "reason": "Not in the import list."})
            continue
        try:
            created.append(
                await state.jobs.create_job(
                    media, profile, options, out_dir, default_output_name(media["original_name"])
                )
            )
        except Exception as exc:  # noqa: BLE001 - reported per item
            skipped.append({"media_id": media_id, "name": media["original_name"], "reason": str(exc)})
    return {"created": created, "skipped": skipped}


@router.get("/jobs")
def list_jobs(request: Request, include_hidden: bool = False) -> list[dict[str, Any]]:
    return get_state(request).jobs.list_jobs(include_hidden=include_hidden)


def _job(state: AppState, job_id: str) -> dict[str, Any]:
    row = state.db.get_job(job_id)
    if row is None:
        raise HTTPException(404, "That job doesn't exist.")
    return row


@router.get("/jobs/{job_id}")
def get_job(request: Request, job_id: str) -> dict[str, Any]:
    state = get_state(request)
    return state.jobs.public_job(_job(state, job_id))


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(request: Request, job_id: str) -> dict[str, str]:
    await get_state(request).jobs.cancel(job_id)
    return {"status": "ok"}


@router.post("/jobs/{job_id}/retry")
async def retry_job(request: Request, job_id: str) -> dict[str, Any]:
    state = get_state(request)
    row = _job(state, job_id)
    if row["status"] not in ("failed", "canceled", "interrupted"):
        raise HTTPException(409, "Only failed, canceled or interrupted jobs can be retried.")
    media = state.db.get_media(row["media_id"])
    if media is None:
        raise HTTPException(
            410, "The source movie is no longer in the import list. Import it again to retry."
        )
    # Use the profile exactly as it was when the job was created.
    profile = DeviceProfile.model_validate_json(row["profile_json"])
    options = ConversionOptions.model_validate_json(row["options_json"])
    out_dir = state.output_dir(row["output_dir"]) if row["output_dir"] else state.output_dir()
    job = await state.jobs.create_job(media, profile, options, out_dir, row["output_name"], retry_of=job_id)
    state.jobs.hide(job_id)
    return job


@router.post("/jobs/{job_id}/hide")
def hide_job(request: Request, job_id: str) -> dict[str, str]:
    get_state(request).jobs.hide(job_id)
    return {"status": "ok"}


@router.post("/jobs/hide-finished")
def hide_finished(request: Request) -> dict[str, int]:
    state = get_state(request)
    rows = state.db.query(f"SELECT id FROM jobs WHERE queue_hidden = 0 AND status IN {FINISHED_STATUSES}")
    for r in rows:
        state.jobs.hide(r["id"])
    return {"hidden": len(rows)}


@router.delete("/history/{job_id}")
def delete_history(request: Request, job_id: str) -> dict[str, str]:
    get_state(request).jobs.delete_record(job_id)
    return {"status": "deleted"}


@router.delete("/history")
def clear_history(request: Request) -> dict[str, int]:
    return {"deleted": get_state(request).jobs.clear_history()}


@router.get("/history")
def history(request: Request) -> list[dict[str, Any]]:
    state = get_state(request)
    rows = state.db.query(f"SELECT * FROM jobs WHERE status IN {FINISHED_STATUSES} ORDER BY finished_at DESC")
    return [state.jobs.public_job(r) for r in rows]


def _output_file(state: AppState, job_id: str, kind: str = "output") -> Path:
    row = _job(state, job_id)
    raw = row["srt_path"] if kind == "srt" else row["output_path"]
    if row["status"] != "completed" or not raw:
        raise HTTPException(404, "There's no converted file for this job (it may have been forgotten).")
    path = resolve_within(Path(raw), state.settings.output_roots)
    if not path.is_file():
        raise HTTPException(410, "The converted file has been moved or deleted.")
    return path


@router.get("/jobs/{job_id}/download")
def download(request: Request, job_id: str) -> FileResponse:
    path = _output_file(get_state(request), job_id)
    return FileResponse(path, filename=path.name, media_type="application/octet-stream")


@router.get("/jobs/{job_id}/subtitles")
def download_subtitles(request: Request, job_id: str) -> FileResponse:
    path = _output_file(get_state(request), job_id, "srt")
    return FileResponse(path, filename=path.name, media_type="application/x-subrip")


@router.post("/jobs/{job_id}/reveal")
def reveal(request: Request, job_id: str) -> dict[str, str]:
    """Show the converted file in Finder / Explorer / the file manager."""
    path = _output_file(get_state(request), job_id)
    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(path)])
        elif sys.platform == "win32":
            subprocess.Popen(["explorer", f"/select,{path}"])
        else:
            subprocess.Popen(["xdg-open", str(path.parent)])
    except OSError as exc:
        raise HTTPException(501, "Opening the folder isn't supported on this system.") from exc
    return {"status": "ok"}


@router.get("/stats")
def stats(request: Request) -> dict[str, Any]:
    state = get_state(request)
    counts = {
        r["status"]: r["n"] for r in state.db.query("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status")
    }
    saved = state.db.one("SELECT COALESCE(SUM(output_size), 0) AS total FROM jobs WHERE status = 'completed'")
    last_profile = state.last_used_profile_id()
    profile = None
    if last_profile:
        try:
            profile = state.get_profile(last_profile).model_dump()
        except Exception:  # noqa: BLE001 - the profile may have been deleted
            profile = None
    return {
        "completed": counts.get("completed", 0),
        "failed": counts.get("failed", 0) + counts.get("interrupted", 0),
        "canceled": counts.get("canceled", 0),
        "queued": counts.get("queued", 0),
        "active": counts.get("running", 0) + counts.get("validating", 0),
        "output_bytes": saved["total"] if saved else 0,
        "imported": len(state.db.list_media()),
        "last_profile": profile,
    }


def _sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.get("/events")
async def events(request: Request) -> StreamingResponse:
    """Server-Sent Events: a snapshot, then one event per job change."""
    state = get_state(request)
    queue = state.jobs.subscribe()

    async def stream():
        try:
            yield _sse("snapshot", {"jobs": state.jobs.list_jobs(include_hidden=True)})
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), 15)
                except TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                yield _sse(event["type"], event)
        finally:
            state.jobs.unsubscribe(queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
