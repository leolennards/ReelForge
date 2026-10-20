"""Compatibility engine: compares inspected media with a device profile.

All compatibility rules live here so they can be unit-tested without FFmpeg
and reused for both the source file (before conversion) and the converted
file (the "TV Ready Check").
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from ..media.codecs import (
    BITMAP_SUBTITLES,
    CONTAINER_LABELS,
)
from ..media.models import AudioStream, MediaInfo, SubtitleStream, VideoStream
from .profiles import DeviceProfile

Support = Literal["ok", "uncertain", "unsupported"]
AreaStatus = Literal["compatible", "convert", "uncertain", "missing", "not_applicable"]
Overall = Literal[
    "likely_compatible",
    "remux_recommended",
    "audio_conversion",
    "video_conversion",
    "uncertain",
]

OVERALL_LABELS: dict[str, str] = {
    "likely_compatible": "Likely compatible",
    "remux_recommended": "Container change recommended",
    "audio_conversion": "Audio conversion recommended",
    "video_conversion": "Video conversion required",
    "uncertain": "Compatibility uncertain",
}

# FAT32 cannot store a file of 4 GiB or more (maximum is 4 GiB minus one byte).
FAT32_MAX_FILE_BYTES = 4 * 1024**3 - 1


class StreamCheck(BaseModel):
    support: Support
    reasons: list[str] = []


class AreaVerdict(BaseModel):
    status: AreaStatus
    label: str
    reasons: list[str] = []


class CompatibilityReport(BaseModel):
    profile_id: str
    overall: Overall
    overall_label: str
    areas: dict[str, AreaVerdict]
    disclaimer: str


DISCLAIMER = (
    "This is an assessment based on a general device profile, not a guarantee. Support "
    "varies by TV model, model year and firmware, so test playback on your actual device."
)


# --- Per-stream checks ------------------------------------------------------


def check_video(stream: VideoStream, profile: DeviceProfile) -> StreamCheck:
    reasons: list[str] = []
    support: Support = "ok"
    label = stream.codec_label

    if stream.codec in profile.video_codecs:
        pass
    elif stream.codec in profile.video_uncertain:
        support = "uncertain"
        reasons.append(f"{label} video plays on some models of this device type but not others.")
    else:
        return StreamCheck(
            support="unsupported",
            reasons=[f"{label} video is not expected to play on {profile.name}."],
        )

    max_depth = profile.max_bit_depth.get(stream.codec, 8)
    if stream.bit_depth > max_depth:
        support = "unsupported"
        reasons.append(
            f"The video is {stream.bit_depth}-bit {label}; this profile expects at most "
            f"{max_depth}-bit for that codec."
        )

    if (
        stream.width
        and stream.height
        and (stream.width > profile.max_width or stream.height > profile.max_height)
    ):
        support = "unsupported"
        reasons.append(
            f"Resolution {stream.width}×{stream.height} is above this profile's maximum of "
            f"{profile.max_width}×{profile.max_height}."
        )

    if stream.fps and stream.fps > profile.max_fps + 0.01:
        support = "unsupported"
        reasons.append(
            f"Frame rate {stream.fps:g} fps is above this profile's maximum of {profile.max_fps:g} fps."
        )

    if stream.dolby_vision and support == "ok":
        reasons.append(
            "The video carries Dolby Vision metadata. TVs without Dolby Vision normally fall back "
            "to the HDR10 layer when one exists, but some files show incorrect colours."
        )
    return StreamCheck(support=support, reasons=reasons)


def check_audio(stream: AudioStream, profile: DeviceProfile) -> StreamCheck:
    label = stream.codec_label
    if stream.codec in profile.audio_codecs:
        support: Support = "ok"
        reasons: list[str] = []
    elif stream.codec in profile.audio_uncertain:
        support = "uncertain"
        reasons = [f"{label} audio plays on some models of this device type but not others."]
    else:
        return StreamCheck(
            support="unsupported",
            reasons=[f"{profile.name} may not support the movie's {label} audio."],
        )
    if stream.channels and stream.channels > profile.max_audio_channels:
        support = "unsupported"
        reasons.append(
            f"The track has {stream.channels} channels; this profile allows at most "
            f"{profile.max_audio_channels}."
        )
    return StreamCheck(support=support, reasons=reasons)


def check_subtitle(stream: SubtitleStream, profile: DeviceProfile) -> StreamCheck:
    if stream.codec in profile.subtitle_codecs:
        return StreamCheck(support="ok")
    if stream.codec in BITMAP_SUBTITLES:
        return StreamCheck(
            support="unsupported",
            reasons=[
                f"{stream.codec_label} subtitles are images, which most TVs cannot display "
                "from a USB file and which MP4 cannot store."
            ],
        )
    return StreamCheck(
        support="uncertain",
        reasons=[f"Embedded {stream.codec_label} subtitles may not be shown by {profile.name}."],
    )


def check_container(container: str, profile: DeviceProfile) -> StreamCheck:
    label = CONTAINER_LABELS.get(container, container.upper())
    if container in profile.containers:
        return StreamCheck(support="ok")
    return StreamCheck(
        support="unsupported",
        reasons=[f"The {label} container is not in this profile's supported list."],
    )


# --- Whole-file assessment --------------------------------------------------


def _area(status: AreaStatus, reasons: list[str]) -> AreaVerdict:
    labels = {
        "compatible": "Likely compatible",
        "convert": "Change recommended",
        "uncertain": "Compatibility uncertain",
        "missing": "Not present",
        "not_applicable": "Not applicable",
    }
    return AreaVerdict(status=status, label=labels[status], reasons=reasons)


def _merge(checks: list[StreamCheck]) -> tuple[AreaStatus, list[str]]:
    reasons = [r for c in checks for r in c.reasons]
    if any(c.support == "unsupported" for c in checks):
        return "convert", reasons
    if any(c.support == "uncertain" for c in checks):
        return "uncertain", reasons
    return "compatible", reasons


def assess(info: MediaInfo, profile: DeviceProfile) -> CompatibilityReport:
    areas: dict[str, AreaVerdict] = {}

    c = check_container(info.container, profile)
    areas["container"] = _area("compatible" if c.support == "ok" else "convert", c.reasons)

    video = info.video_stream(info.primary_video)
    if video is None:
        areas["video"] = _area("missing", ["This file has no video stream."])
    else:
        status, reasons = _merge([check_video(video, profile)])
        areas["video"] = _area(status, reasons)

    if not info.audio:
        areas["audio"] = _area("missing", ["This file has no audio track, so the movie will play silently."])
    else:
        status, reasons = _merge([check_audio(a, profile) for a in info.audio])
        primary = info.audio_stream(info.primary_audio)
        if primary and check_audio(primary, profile).support == "ok" and status == "convert":
            reasons.append("The main audio track is fine; only additional tracks are affected.")
        areas["audio"] = _area(status, reasons)

    if not info.subtitles:
        areas["subtitles"] = _area("not_applicable", ["No embedded subtitles."])
    else:
        checks = [check_subtitle(s, profile) for s in info.subtitles]
        # Subtitles never block playback of the movie itself, so an
        # unsupported subtitle is reported as uncertain rather than "convert".
        status, reasons = _merge(checks)
        areas["subtitles"] = _area("uncertain" if status == "convert" else status, reasons)

    overall = _overall(info, profile, areas)
    return CompatibilityReport(
        profile_id=profile.id,
        overall=overall,
        overall_label=OVERALL_LABELS[overall],
        areas=areas,
        disclaimer=DISCLAIMER,
    )


def _overall(info: MediaInfo, profile: DeviceProfile, areas: dict[str, AreaVerdict]) -> Overall:
    if areas["video"].status == "convert":
        return "video_conversion"
    primary = info.audio_stream(info.primary_audio)
    # Uncertain audio is converted by the recommendation (it is cheap and
    # low-risk), so it is reported the same way as unsupported audio.
    if primary is not None and check_audio(primary, profile).support != "ok":
        return "audio_conversion"
    if areas["audio"].status == "convert":
        return "audio_conversion"
    if areas["container"].status == "convert":
        return "remux_recommended"
    if any(a.status == "uncertain" for a in areas.values()):
        return "uncertain"
    return "likely_compatible"


# --- TV Ready Check (applied to a finished file) ----------------------------


class ReadyItem(BaseModel):
    key: str
    status: Literal["pass", "warn", "fail", "info"]
    title: str
    detail: str


def tv_ready_check(
    info: MediaInfo, profile: DeviceProfile, fs_limit_bytes: int | None = FAT32_MAX_FILE_BYTES
) -> list[ReadyItem]:
    report = assess(info, profile)
    items: list[ReadyItem] = []

    def from_area(key: str, title: str, ok_detail: str) -> None:
        area = report.areas[key]
        status = {
            "compatible": "pass",
            "uncertain": "warn",
            "convert": "fail",
            "missing": "warn",
            "not_applicable": "info",
        }[area.status]
        items.append(
            ReadyItem(
                key=key,
                status=status,
                title=title,
                detail=" ".join(area.reasons) if area.reasons else ok_detail,
            )
        )

    from_area(
        "container",
        "Container",
        f"{info.container_label} is in the {profile.name} profile.",
    )
    video = info.video_stream(info.primary_video)
    from_area(
        "video",
        "Video codec",
        f"{video.codec_label if video else 'Video'} matches the profile.",
    )
    if video and video.width and video.height:
        too_big = video.width > profile.max_width or video.height > profile.max_height
        items.append(
            ReadyItem(
                key="resolution",
                status="fail" if too_big else "pass",
                title="Resolution",
                detail=f"{video.width}×{video.height}"
                + (
                    f" exceeds {profile.max_width}×{profile.max_height}."
                    if too_big
                    else f" is within the profile's {profile.max_width}×{profile.max_height} limit."
                ),
            )
        )
    primary_audio = info.audio_stream(info.primary_audio)
    from_area(
        "audio",
        "Audio codec",
        f"{primary_audio.codec_label if primary_audio else 'Audio'} matches the profile.",
    )
    from_area("subtitles", "Subtitles", "Subtitle tracks match the profile.")

    if fs_limit_bytes is not None:
        over = info.size > fs_limit_bytes
        items.append(
            ReadyItem(
                key="file_size",
                status="warn" if over else "pass",
                title="USB file size",
                detail=(
                    "The file is larger than 4 GiB, so it cannot be copied to a FAT32-formatted "
                    "USB drive. Use exFAT or NTFS if your TV supports it."
                    if over
                    else "The file is under 4 GiB, so it fits on FAT32, exFAT and NTFS drives."
                ),
            )
        )
    return items
