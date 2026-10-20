"""User-adjustable conversion options.

Every field is a closed set of choices or a bounded number. The frontend can
only pick from these; it never supplies codec names, filters or command-line
fragments directly.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["recommended", "audio_only", "remux", "full", "custom"]
Quality = Literal["high", "balanced", "compact"]


class ConversionOptions(BaseModel):
    mode: Mode = "recommended"
    container: Literal["auto", "mp4", "mkv"] = "auto"
    video_codec: Literal["auto", "copy", "h264", "hevc"] = "auto"
    quality: Quality = "balanced"
    crf: int | None = Field(default=None, ge=12, le=35)
    encoder_preset: Literal["veryfast", "faster", "fast", "medium", "slow"] = "medium"
    max_height: Literal[0, 480, 720, 1080, 1440, 2160] = 0  # 0 = keep / profile limit
    frame_rate: Literal["keep", "24", "25", "30", "50", "60"] = "keep"
    audio_codec: Literal["auto", "copy", "aac", "ac3", "eac3", "mp3"] = "auto"
    audio_bitrate_kbps: int | None = Field(default=None, ge=64, le=1536)
    audio_channels: Literal["auto", "stereo", "5.1"] = "auto"
    audio_tracks: Literal["all", "primary", "selected"] = "all"
    audio_stream: int | None = Field(default=None, ge=0, le=1000)
    subtitles: Literal["auto", "keep_compatible", "first_only", "selected", "none"] = "auto"
    subtitle_stream: int | None = Field(default=None, ge=0, le=1000)
    external_srt: bool = False
    keep_metadata: bool = True
    keep_chapters: bool = True
    hardware_acceleration: bool = False
