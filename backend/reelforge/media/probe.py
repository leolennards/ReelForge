"""Media inspection with FFprobe."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from .codecs import (
    BITMAP_SUBTITLES,
    CONTAINER_LABELS,
    HDR_TRANSFERS,
    HIGH_BIT_DEPTH_HINTS,
    TEXT_SUBTITLES,
    codec_label,
    container_from_probe,
)
from .models import AudioStream, MediaInfo, SubtitleStream, VideoStream

log = logging.getLogger(__name__)

PROBE_TIMEOUT_SECONDS = 60


class ProbeError(Exception):
    """The file could not be inspected (missing, corrupt, or not media)."""


def _int(value: Any) -> int | None:
    try:
        return int(value) if value not in (None, "", "N/A") else None
    except (TypeError, ValueError):
        return None


def _float(value: Any) -> float | None:
    try:
        return float(value) if value not in (None, "", "N/A") else None
    except (TypeError, ValueError):
        return None


def _fps(rate: str | None) -> float | None:
    if not rate or "/" not in rate:
        return _float(rate)
    num, den = rate.split("/", 1)
    n, d = _float(num), _float(den)
    if not n or not d:
        return None
    return round(n / d, 3)


def _tag(tags: dict[str, str], *names: str) -> str | None:
    lowered = {k.lower(): v for k, v in tags.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value:
            return value
    return None


def _stream_bitrate(stream: dict, tags: dict[str, str]) -> int | None:
    # MKV files muxed by mkvmerge carry statistics tags instead of bit_rate.
    return _int(stream.get("bit_rate")) or _int(_tag(tags, "BPS", "BPS-eng"))


def _language(tags: dict[str, str]) -> str | None:
    lang = _tag(tags, "language")
    return None if not lang or lang.lower() in {"und", "unk"} else lang.lower()


def _bit_depth(stream: dict) -> int:
    raw = _int(stream.get("bits_per_raw_sample"))
    if raw and raw > 8:
        return raw
    pix_fmt = stream.get("pix_fmt") or ""
    if any(hint in pix_fmt for hint in HIGH_BIT_DEPTH_HINTS):
        return 12 if "12" in pix_fmt else 10
    return 8


def parse_probe(data: dict, path: Path, size: int) -> MediaInfo:
    fmt = data.get("format") or {}
    fmt_tags = fmt.get("tags") or {}
    container = container_from_probe(fmt.get("format_name"), path.suffix, _tag(fmt_tags, "major_brand"))

    info = MediaInfo(
        container=container,
        container_label=CONTAINER_LABELS.get(container, container.upper()),
        format_name=fmt.get("format_name"),
        size=size,
        duration=_float(fmt.get("duration")),
        bitrate=_int(fmt.get("bit_rate")),
        title=_tag(fmt_tags, "title"),
        chapters=len(data.get("chapters") or []),
    )

    for stream in data.get("streams") or []:
        kind = stream.get("codec_type")
        codec = (stream.get("codec_name") or "unknown").lower()
        tags = stream.get("tags") or {}
        disposition = stream.get("disposition") or {}
        common = {
            "index": int(stream.get("index", 0)),
            "codec": codec,
            "language": _language(tags),
            "title": _tag(tags, "title"),
            "default": bool(disposition.get("default")),
        }
        if kind == "video":
            if disposition.get("attached_pic"):
                # Cover art embedded as a video stream; not part of the movie.
                info.attachments += 1
                continue
            transfer = stream.get("color_transfer")
            side_data = stream.get("side_data_list") or []
            info.video.append(
                VideoStream(
                    **common,
                    codec_label=codec_label(codec),
                    profile=stream.get("profile"),
                    level=_int(stream.get("level")),
                    width=_int(stream.get("width")),
                    height=_int(stream.get("height")),
                    pix_fmt=stream.get("pix_fmt"),
                    bit_depth=_bit_depth(stream),
                    fps=_fps(stream.get("avg_frame_rate")) or _fps(stream.get("r_frame_rate")),
                    bitrate=_stream_bitrate(stream, tags),
                    hdr=("HDR10" if transfer == "smpte2084" else "HLG")
                    if transfer in HDR_TRANSFERS
                    else None,
                    dolby_vision=any(
                        "dovi" in (sd.get("side_data_type") or "").lower()
                        or "dolby vision" in (sd.get("side_data_type") or "").lower()
                        for sd in side_data
                    ),
                )
            )
        elif kind == "audio":
            profile = stream.get("profile")
            info.audio.append(
                AudioStream(
                    **common,
                    codec_label=codec_label(codec, profile),
                    profile=profile,
                    channels=_int(stream.get("channels")),
                    channel_layout=stream.get("channel_layout"),
                    sample_rate=_int(stream.get("sample_rate")),
                    bitrate=_stream_bitrate(stream, tags),
                )
            )
        elif kind == "subtitle":
            sub_kind = (
                "text" if codec in TEXT_SUBTITLES else "bitmap" if codec in BITMAP_SUBTITLES else "other"
            )
            info.subtitles.append(
                SubtitleStream(
                    **common,
                    codec_label=codec_label(codec),
                    kind=sub_kind,
                    forced=bool(disposition.get("forced")),
                )
            )
        elif kind == "attachment":
            info.attachments += 1
        else:
            info.data_streams += 1

    if info.video:
        info.primary_video = info.video[0].index
    if info.audio:
        default = next((a for a in info.audio if a.default), info.audio[0])
        info.primary_audio = default.index
    return info


async def probe(ffprobe: str, path: Path) -> MediaInfo:
    """Inspect ``path`` and return structured media information.

    Raises ProbeError with a user-presentable message when the file cannot be
    read as media.
    """
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise ProbeError("The file could not be found or opened.") from exc
    if size == 0:
        raise ProbeError("The file is empty.")

    try:
        proc = await asyncio.create_subprocess_exec(
            ffprobe,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            "-show_chapters",
            # "file:" stops a name such as "concat:..." being read as a protocol.
            f"file:{path}",
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError as exc:
        raise ProbeError("FFprobe could not be started.") from exc

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), PROBE_TIMEOUT_SECONDS)
    except TimeoutError as exc:
        proc.kill()
        await proc.wait()
        raise ProbeError("Inspecting the file took too long; it may be damaged.") from exc

    if proc.returncode != 0:
        detail = stderr.decode(errors="replace").strip().splitlines()[-1:] or ["unknown error"]
        log.info("ffprobe failed", extra={"detail": detail[0][:300]})
        raise ProbeError(
            "This file could not be read as a movie. It may be incomplete, corrupt, or not a video file."
        )

    try:
        data = json.loads(stdout.decode(errors="replace") or "{}")
    except json.JSONDecodeError as exc:
        raise ProbeError("FFprobe returned unreadable output for this file.") from exc

    info = parse_probe(data, path, size)
    if not info.video and not info.audio:
        raise ProbeError("No video or audio streams were found in this file.")
    return info
