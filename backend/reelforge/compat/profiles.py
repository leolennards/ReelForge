"""Device profiles: what a class of playback device is *likely* to handle.

The built-in presets describe broad, commonly reported USB playback support.
They are not official manufacturer specifications. Support varies with the
exact model, model year, firmware, container and codec profile, so anything
known to vary between models is listed under ``*_uncertain`` and produces a
"Compatibility uncertain" result rather than a confident answer.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from ..media.codecs import (
    AUDIO_ENCODERS,
    AUDIO_LABELS,
    CONTAINER_LABELS,
    OUTPUT_CONTAINERS,
    SUBTITLE_LABELS,
    VIDEO_ENCODERS,
    VIDEO_LABELS,
)

Priority = Literal["quality", "compatibility"]
SubtitlePreference = Literal["keep_compatible", "first_only", "none"]

KNOWN_VIDEO = set(VIDEO_LABELS)
KNOWN_AUDIO = set(AUDIO_LABELS)
KNOWN_SUBTITLES = set(SUBTITLE_LABELS)
KNOWN_CONTAINERS = set(CONTAINER_LABELS)


class DeviceProfile(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{1,47}$")
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=400)
    builtin: bool = False
    containers: list[str] = Field(min_length=1)
    video_codecs: list[str] = Field(min_length=1)
    video_uncertain: list[str] = []
    audio_codecs: list[str] = Field(min_length=1)
    audio_uncertain: list[str] = []
    subtitle_codecs: list[str] = []
    max_width: int = Field(default=3840, ge=320, le=7680)
    max_height: int = Field(default=2160, ge=240, le=4320)
    max_fps: float = Field(default=60, ge=10, le=240)
    # Highest bit depth the device is expected to decode, per video codec.
    max_bit_depth: dict[str, int] = {"h264": 8, "hevc": 10}
    max_audio_channels: int = Field(default=8, ge=1, le=8)
    preferred_container: Literal["mp4", "mkv"] = "mp4"
    preferred_video_codec: Literal["h264", "hevc"] = "h264"
    preferred_audio_codec: Literal["aac", "ac3", "eac3", "mp3"] = "aac"
    subtitle_preference: SubtitlePreference = "keep_compatible"
    priority: Priority = "quality"
    notes: list[str] = []

    @field_validator("containers")
    @classmethod
    def _containers(cls, v: list[str]) -> list[str]:
        return _check_known(v, KNOWN_CONTAINERS, "container")

    @field_validator("video_codecs", "video_uncertain")
    @classmethod
    def _video(cls, v: list[str]) -> list[str]:
        return _check_known(v, KNOWN_VIDEO, "video codec")

    @field_validator("audio_codecs", "audio_uncertain")
    @classmethod
    def _audio(cls, v: list[str]) -> list[str]:
        return _check_known(v, KNOWN_AUDIO, "audio codec")

    @field_validator("subtitle_codecs")
    @classmethod
    def _subs(cls, v: list[str]) -> list[str]:
        return _check_known(v, KNOWN_SUBTITLES, "subtitle format")

    @field_validator("max_bit_depth")
    @classmethod
    def _depth(cls, v: dict[str, int]) -> dict[str, int]:
        for codec, depth in v.items():
            if codec not in KNOWN_VIDEO or depth not in (8, 10, 12):
                raise ValueError(f"invalid bit depth entry {codec}={depth}")
        return v

    @model_validator(mode="after")
    def _consistent(self) -> DeviceProfile:
        if self.preferred_container not in self.containers:
            raise ValueError("The preferred container must be one of the supported containers.")
        if self.preferred_video_codec not in self.video_codecs:
            raise ValueError("The preferred video codec must be one of the supported video codecs.")
        if self.preferred_audio_codec not in self.audio_codecs:
            raise ValueError("The preferred audio codec must be one of the supported audio codecs.")
        overlap = set(self.audio_codecs) & set(self.audio_uncertain)
        if overlap or set(self.video_codecs) & set(self.video_uncertain):
            raise ValueError("A codec cannot be both supported and uncertain.")
        return self


def _check_known(values: list[str], known: set[str], what: str) -> list[str]:
    cleaned: list[str] = []
    for value in values:
        value = value.strip().lower()
        if value not in known:
            raise ValueError(f"Unknown {what}: {value}")
        if value not in cleaned:
            cleaned.append(value)
    return cleaned


_GENERIC_NOTE = (
    "This is a general profile based on commonly reported USB playback support, "
    "not an official specification. Check your TV's manual for its exact model."
)

BUILTIN_PROFILES: list[DeviceProfile] = [
    DeviceProfile(
        id="universal",
        name="Universal USB Playback",
        description="Conservative settings that most TVs, consoles and media players made in "
        "the last decade can play. Best choice when you don't know the exact TV model.",
        builtin=True,
        containers=["mp4"],
        video_codecs=["h264"],
        video_uncertain=["hevc"],
        audio_codecs=["aac", "mp3"],
        audio_uncertain=["ac3"],
        subtitle_codecs=["mov_text"],
        max_width=1920,
        max_height=1080,
        max_fps=60,
        max_bit_depth={"h264": 8},
        max_audio_channels=6,
        preferred_container="mp4",
        preferred_video_codec="h264",
        preferred_audio_codec="aac",
        priority="compatibility",
        notes=[
            _GENERIC_NOTE,
            "Limits video to 1080p H.264 because 4K and HEVC playback depend on the device.",
            "Embedded subtitles are often ignored by TVs when playing from USB; an external "
            ".srt file with the same name as the movie is the most reliable option.",
        ],
    ),
    DeviceProfile(
        id="samsung",
        name="Samsung Smart TV",
        description="Generic USB playback for recent Samsung Tizen TVs. Model years differ, "
        "most notably in DTS audio support.",
        builtin=True,
        containers=["mp4", "mkv", "mov", "avi", "ts"],
        video_codecs=["h264", "hevc", "mpeg4", "mpeg2video", "vp9"],
        video_uncertain=["av1"],
        audio_codecs=["aac", "ac3", "eac3", "mp3"],
        audio_uncertain=["flac", "opus", "vorbis"],
        subtitle_codecs=["subrip", "mov_text"],
        max_width=3840,
        max_height=2160,
        max_fps=60,
        max_bit_depth={"h264": 8, "hevc": 10, "vp9": 10, "av1": 10},
        max_audio_channels=6,
        preferred_container="mkv",
        preferred_video_codec="h264",
        preferred_audio_codec="ac3",
        priority="quality",
        notes=[
            _GENERIC_NOTE,
            "Many Samsung TVs from 2018 onwards are widely reported not to play DTS audio, so "
            "DTS tracks are converted.",
            "4K and HEVC support depend on the model; older or lower-end models may need the "
            "Universal profile instead.",
        ],
    ),
    DeviceProfile(
        id="lg",
        name="LG Smart TV",
        description="Generic USB playback for recent LG webOS TVs. DTS support has changed "
        "between model years, so it is treated as uncertain.",
        builtin=True,
        containers=["mp4", "mkv", "mov", "avi", "ts"],
        video_codecs=["h264", "hevc", "mpeg4", "mpeg2video", "vp9"],
        video_uncertain=["av1"],
        audio_codecs=["aac", "ac3", "eac3", "mp3"],
        audio_uncertain=["dts", "flac", "opus"],
        subtitle_codecs=["subrip", "mov_text"],
        max_width=3840,
        max_height=2160,
        max_fps=60,
        max_bit_depth={"h264": 8, "hevc": 10, "vp9": 10, "av1": 10},
        max_audio_channels=6,
        preferred_container="mkv",
        preferred_video_codec="h264",
        preferred_audio_codec="ac3",
        priority="quality",
        notes=[
            _GENERIC_NOTE,
            "DTS playback differs between LG model years; check your model or convert to be safe.",
        ],
    ),
    DeviceProfile(
        id="android-tv",
        name="Android TV / Google TV",
        description="Typical playback through the built-in media player on Android TV and "
        "Google TV devices. Third-party apps such as VLC or Kodi can play more formats.",
        builtin=True,
        containers=["mp4", "mkv", "webm", "ts"],
        video_codecs=["h264", "hevc", "vp9"],
        video_uncertain=["av1", "mpeg2video", "mpeg4"],
        audio_codecs=["aac", "ac3", "eac3", "mp3", "opus", "vorbis", "flac"],
        audio_uncertain=["dts", "truehd"],
        subtitle_codecs=["subrip", "mov_text", "webvtt", "ass"],
        max_width=3840,
        max_height=2160,
        max_fps=60,
        max_bit_depth={"h264": 8, "hevc": 10, "vp9": 10, "av1": 10},
        max_audio_channels=8,
        preferred_container="mkv",
        preferred_video_codec="h264",
        preferred_audio_codec="aac",
        priority="quality",
        notes=[
            _GENERIC_NOTE,
            "Dolby and DTS playback often depends on the connected soundbar or receiver "
            "(passthrough) rather than the TV itself.",
        ],
    ),
]

BUILTIN_BY_ID = {p.id: p for p in BUILTIN_PROFILES}

# Template offered when a user creates a custom profile from scratch.
CUSTOM_TEMPLATE = BUILTIN_BY_ID["universal"].model_copy(
    update={"id": "custom", "name": "Custom Profile", "builtin": False, "notes": []}
)


def options_catalog() -> dict:
    """Choices the profile editor and advanced settings may offer."""
    return {
        "containers": [{"id": k, "label": v} for k, v in CONTAINER_LABELS.items()],
        "output_containers": list(OUTPUT_CONTAINERS),
        "video_codecs": [{"id": k, "label": v} for k, v in VIDEO_LABELS.items()],
        "audio_codecs": [{"id": k, "label": v} for k, v in AUDIO_LABELS.items()],
        "subtitle_codecs": [{"id": k, "label": v} for k, v in SUBTITLE_LABELS.items()],
        "video_encode_targets": list(VIDEO_ENCODERS),
        "audio_encode_targets": list(AUDIO_ENCODERS),
    }
