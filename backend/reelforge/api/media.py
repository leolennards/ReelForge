"""Importing movies: browsing the allowed library folders and streaming uploads."""

from __future__ import annotations

import asyncio
import os
import shutil
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.requests import ClientDisconnect

from ..db import ACTIVE_STATUSES, now_iso
from ..media.codecs import SUPPORTED_IMPORT_EXTENSIONS
from ..media.models import MediaInfo
from ..media.probe import ProbeError, probe
from ..paths import free_space, is_hidden, resolve_within, safe_filename
from .deps import get_state

router = APIRouter(prefix="/api", tags=["media"])

MAX_LISTING = 2000


def public_media(row: dict[str, Any]) -> dict[str, Any]:
    info = MediaInfo.model_validate_json(row["info_json"]) if row["info_json"] else None
    return {
        "id": row["id"],
        "name": row["original_name"],
        "size": row["size"],
        "extension": row["extension"],
        "source_kind": row["source_kind"],
        # Only library files reveal where they live; uploads are internal copies.
        "location": str(Path(row["path"]).parent)
        if row["source_kind"] == "library" and row["path"]
        else None,
        "created_at": row["created_at"],
        "info": info.model_dump() if info else None,
        "languages": info.languages if info else [],
    }


# --- library browsing -------------------------------------------------------


@router.get("/library/roots")
def library_roots(request: Request) -> list[dict[str, Any]]:
    state = get_state(request)
    return [
        {"id": i, "name": p.name or str(p), "path": str(p), "exists": p.is_dir()}
        for i, p in enumerate(state.settings.media_dirs)
    ]


def _root(request: Request, root: int) -> Path:
    dirs = get_state(request).settings.media_dirs
    if root < 0 or root >= len(dirs):
        raise HTTPException(404, "That library folder doesn't exist.")
    return dirs[root].expanduser().resolve()


@router.get("/library/browse")
def library_browse(request: Request, root: int = 0, path: str = "") -> dict[str, Any]:
    base = _root(request, root)
    target = resolve_within(base / path, [base])
    if not target.is_dir() or is_hidden(target, base):
        raise HTTPException(404, "That folder doesn't exist.")
    dirs: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    try:
        entries = sorted(os.scandir(target), key=lambda e: e.name.lower())
    except PermissionError as exc:
        raise HTTPException(403, "ReelForge doesn't have permission to read that folder.") from exc
    for entry in entries[:MAX_LISTING]:
        if entry.name.startswith("."):
            continue
        rel = str(Path(entry.path).relative_to(base))
        try:
            if entry.is_dir():
                dirs.append({"name": entry.name, "path": rel})
            elif entry.is_file() and Path(entry.name).suffix.lower() in SUPPORTED_IMPORT_EXTENSIONS:
                files.append(
                    {
                        "name": entry.name,
                        "path": rel,
                        "size": entry.stat().st_size,
                        "extension": Path(entry.name).suffix.lower(),
                    }
                )
        except OSError:
            continue
    if target == base:
        rel_target, parent = "", None
    else:
        rel_target = str(target.relative_to(base))
        parent = "" if target.parent == base else str(target.parent.relative_to(base))
    return {"root": root, "path": rel_target, "parent": parent, "dirs": dirs, "files": files}


class LibraryImport(BaseModel):
    root: int = Field(ge=0)
    path: str = Field(min_length=1, max_length=4096)


@router.post("/media/library")
async def import_library_file(request: Request, body: LibraryImport) -> dict[str, Any]:
    state = get_state(request)
    base = _root(request, body.root)
    target = resolve_within(base / body.path, [base])
    if is_hidden(target, base) or not target.is_file():
        raise HTTPException(404, "That file doesn't exist.")
    ext = target.suffix.lower()
    if ext not in SUPPORTED_IMPORT_EXTENSIONS:
        raise HTTPException(415, f"{ext or 'This'} files aren't supported. Choose a movie file.")
    existing = state.db.one(
        "SELECT * FROM media WHERE path = ? AND removed = 0 AND source_kind = 'library'",
        (str(target),),
    )
    info = await _analyse(state, target)
    if existing:
        state.db.execute(
            "UPDATE media SET info_json = ?, size = ? WHERE id = ?",
            (info.model_dump_json(), info.size, existing["id"]),
        )
        row = state.db.get_media(existing["id"])
    else:
        row = _insert(state, "library", target, target.name, info)
    assert row is not None
    return public_media(row)


# --- uploads ----------------------------------------------------------------


@router.put("/media/upload")
async def upload(request: Request) -> dict[str, Any]:
    """Stream a file from the browser to disk in chunks (never fully in memory)."""
    state = get_state(request)
    raw_name = request.headers.get("x-filename")
    if not raw_name:
        raise HTTPException(400, "Missing file name.")
    original = unquote(raw_name)[:255]
    ext = Path(original).suffix.lower()
    if ext not in SUPPORTED_IMPORT_EXTENSIONS:
        raise HTTPException(415, f"{ext or 'This'} files aren't supported. Choose a movie file.")
    try:
        length = int(request.headers.get("content-length", "0"))
    except ValueError:
        length = 0
    if length <= 0:
        raise HTTPException(411, "The upload size is unknown or the file is empty.")
    limit = state.settings.max_upload_bytes
    if length > limit:
        raise HTTPException(
            413,
            f"This file is larger than the {limit / 1024**3:.0f} GB upload limit. "
            "Use “Browse library” to convert it in place instead.",
        )
    upload_root = state.settings.upload_dir
    upload_root.mkdir(parents=True, exist_ok=True)
    if free_space(upload_root) < length + state.settings.min_free_bytes:
        raise HTTPException(507, "There isn't enough free disk space to receive this file.")

    media_id = uuid.uuid4().hex[:12]
    dest_dir = upload_root / media_id
    dest_dir.mkdir()
    dest = dest_dir / f"{safe_filename(Path(original).stem)}{ext}"
    written = 0
    try:
        with open(dest, "wb") as fh:
            async for chunk in request.stream():
                written += len(chunk)
                if written > length or written > limit:
                    raise HTTPException(400, "The upload was larger than announced.")
                await asyncio.to_thread(fh.write, chunk)
        if written != length:
            raise HTTPException(400, "The upload was interrupted before it finished.")
    except (HTTPException, ClientDisconnect, OSError) as exc:
        shutil.rmtree(dest_dir, ignore_errors=True)
        if isinstance(exc, HTTPException):
            raise
        if isinstance(exc, ClientDisconnect):
            raise HTTPException(400, "The upload was canceled.") from exc
        raise HTTPException(500, f"The file couldn't be saved: {exc.strerror}") from exc

    try:
        info = await _analyse(state, dest)
    except HTTPException:
        shutil.rmtree(dest_dir, ignore_errors=True)
        raise
    row = _insert(state, "upload", dest, original, info, media_id=media_id)
    return public_media(row)


# --- imported media -----------------------------------------------------------


@router.get("/media")
def list_media(request: Request) -> list[dict[str, Any]]:
    return [public_media(r) for r in get_state(request).db.list_media()]


@router.get("/media/{media_id}")
def get_media(request: Request, media_id: str) -> dict[str, Any]:
    row = get_state(request).db.get_media(media_id)
    if row is None:
        raise HTTPException(404, "That movie isn't in the import list.")
    return public_media(row)


@router.delete("/media/{media_id}")
def remove_media(request: Request, media_id: str) -> dict[str, str]:
    """Remove a movie from the pending list. Library originals are never deleted."""
    state = get_state(request)
    row = state.db.get_media(media_id)
    if row is None:
        raise HTTPException(404, "That movie isn't in the import list.")
    if state.db.one(f"SELECT id FROM jobs WHERE media_id = ? AND status IN {ACTIVE_STATUSES}", (media_id,)):
        raise HTTPException(409, "This movie has a conversion in the queue. Cancel it first.")
    if row["source_kind"] == "upload" and row["path"]:
        shutil.rmtree(Path(row["path"]).parent, ignore_errors=True)
    state.db.execute("UPDATE media SET removed = 1, path = NULL WHERE id = ?", (media_id,))
    return {"status": "removed"}


# --- helpers ------------------------------------------------------------------


async def _analyse(state, path: Path) -> MediaInfo:
    if not state.ffmpeg.available:
        raise HTTPException(503, "FFprobe isn't available, so the movie can't be analysed.")
    try:
        return await probe(state.ffmpeg.ffprobe_path, path)
    except ProbeError as exc:
        raise HTTPException(422, str(exc)) from exc


def _insert(state, kind: str, path: Path, name: str, info: MediaInfo, media_id: str | None = None):
    media_id = media_id or uuid.uuid4().hex[:12]
    state.db.insert_media(
        {
            "id": media_id,
            "source_kind": kind,
            "path": str(path),
            "original_name": name,
            "size": info.size,
            "extension": path.suffix.lower(),
            "info_json": info.model_dump_json(),
            "created_at": now_iso(),
        }
    )
    return state.db.get_media(media_id)
