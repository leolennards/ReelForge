"""System status, device profiles, settings and the output-folder browser."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from ..app_settings import AppSettings
from ..compat.profiles import CUSTOM_TEMPLATE, DeviceProfile, options_catalog
from ..config import APP_NAME, APP_VERSION
from ..media.ffmpeg_tools import detect_ffmpeg
from ..paths import free_space, resolve_within
from .deps import get_state

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": APP_NAME, "version": APP_VERSION}


@router.get("/system")
def system(request: Request) -> dict[str, Any]:
    state = get_state(request)
    try:
        out_dir = state.output_dir()
        out_free = free_space(out_dir)
    except Exception:  # noqa: BLE001 - shown as "unknown" in the UI
        out_dir, out_free = None, None
    return {
        "app": APP_NAME,
        "version": APP_VERSION,
        "local_only": True,
        "ffmpeg": state.ffmpeg.to_public(),
        "media_dirs": [str(p) for p in state.settings.media_dirs],
        "output_roots": [str(p) for p in state.settings.output_roots],
        "output_dir": str(out_dir) if out_dir else None,
        "output_free_bytes": out_free,
        "max_upload_bytes": state.settings.max_upload_bytes,
        "data_dir": str(state.settings.data_dir),
        "stored_data": [
            "File names, sizes and media details of imported movies",
            "Conversion settings, results and timings",
            "Full file paths, which are forgotten automatically after the retention period",
            "Your settings and custom device profiles",
        ],
    }


@router.post("/system/recheck")
async def recheck(request: Request) -> dict[str, Any]:
    state = get_state(request)
    fresh = await asyncio.to_thread(detect_ffmpeg, state.settings)
    # Update in place so the job manager sees the same object.
    for field in ("ffmpeg_path", "ffprobe_path", "version", "encoders", "hardware_encoders", "error"):
        setattr(state.ffmpeg, field, getattr(fresh, field))
    return state.ffmpeg.to_public()


# --- profiles ---------------------------------------------------------------


@router.get("/profiles")
def list_profiles(request: Request) -> list[dict[str, Any]]:
    return [p.model_dump() for p in get_state(request).list_profiles()]


@router.get("/profiles/options")
def profile_options() -> dict[str, Any]:
    return {**options_catalog(), "template": CUSTOM_TEMPLATE.model_dump()}


@router.put("/profiles/{profile_id}")
def save_profile(request: Request, profile_id: str, profile: DeviceProfile) -> dict[str, Any]:
    if profile.id != profile_id:
        raise HTTPException(400, "The profile id doesn't match the address.")
    return get_state(request).save_profile(profile).model_dump()


@router.delete("/profiles/{profile_id}")
def delete_profile(request: Request, profile_id: str) -> dict[str, str]:
    get_state(request).delete_profile(profile_id)
    return {"status": "deleted"}


# --- settings ---------------------------------------------------------------


@router.get("/settings")
def get_settings(request: Request) -> dict[str, Any]:
    state = get_state(request)
    return {
        **state.app_settings.model_dump(),
        "effective_output_dir": str(state.output_dir()),
    }


@router.put("/settings")
def put_settings(request: Request, body: AppSettings) -> dict[str, Any]:
    state = get_state(request)
    state.update_app_settings(body)
    return get_settings(request)


@router.post("/settings/reset")
def reset_settings(request: Request) -> dict[str, Any]:
    get_state(request).update_app_settings(AppSettings())
    return get_settings(request)


@router.get("/fs/dirs")
def list_dirs(request: Request, path: str | None = None) -> dict[str, Any]:
    """List sub-folders (never files) inside the allowed output roots."""
    state = get_state(request)
    roots = state.settings.output_roots
    if not path:
        return {
            "path": None,
            "parent": None,
            "dirs": [{"name": str(r), "path": str(r)} for r in roots if r.is_dir()],
        }
    target = resolve_within(Path(path), roots)
    if not target.is_dir():
        raise HTTPException(404, "That folder doesn't exist.")
    try:
        entries = sorted(
            (e for e in os.scandir(target) if e.is_dir() and not e.name.startswith(".")),
            key=lambda e: e.name.lower(),
        )
    except PermissionError as exc:
        raise HTTPException(403, "ReelForge doesn't have permission to read that folder.") from exc
    parent: str | None = str(target.parent)
    try:
        resolve_within(target.parent, roots)
    except Exception:  # noqa: BLE001 - parent is outside the allowed roots
        parent = None
    return {
        "path": str(target),
        "parent": parent if target.parent != target else None,
        "dirs": [{"name": e.name, "path": e.path} for e in entries[:500]],
    }
