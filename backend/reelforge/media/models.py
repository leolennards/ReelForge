"""Structured media information produced by FFprobe inspection."""

from __future__ import annotations

from pydantic import BaseModel


class VideoStream(BaseModel):
    index: int
    codec: str
    codec_label: str
    profile: str | None = None
    level: int | None = None
    width: int | None = None
    height: int | None = None
    pix_fmt: str | None = None
    bit_depth: int = 8
    fps: float | None = None
    bitrate: int | None = None
    hdr: str | None = None  # "HDR10", "HLG" or None
    dolby_vision: bool = False
    language: str | None = None
    title: str | None = None
    default: bool = False


class AudioStream(BaseModel):
    index: int
    codec: str
    codec_label: str
    profile: str | None = None
    channels: int | None = None
    channel_layout: str | None = None
    sample_rate: int | None = None
    bitrate: int | None = None
    language: str | None = None
    title: str | None = None
    default: bool = False


class SubtitleStream(BaseModel):
    index: int
    codec: str
    codec_label: str
    kind: str  # "text", "bitmap" or "other"
    language: str | None = None
    title: str | None = None
    default: bool = False
    forced: bool = False


class MediaInfo(BaseModel):
    container: str
    container_label: str
    format_name: str | None = None
    size: int
    duration: float | None = None
    bitrate: int | None = None
    title: str | None = None
    video: list[VideoStream] = []
    audio: list[AudioStream] = []
    subtitles: list[SubtitleStream] = []
    attachments: int = 0
    data_streams: int = 0
    chapters: int = 0
    primary_video: int | None = None  # absolute stream index
    primary_audio: int | None = None

    def video_stream(self, index: int | None) -> VideoStream | None:
        return next((s for s in self.video if s.index == index), None)

    def audio_stream(self, index: int | None) -> AudioStream | None:
        return next((s for s in self.audio if s.index == index), None)

    @property
    def languages(self) -> list[str]:
        seen: list[str] = []
        for stream in [*self.audio, *self.subtitles]:
            if stream.language and stream.language not in seen:
                seen.append(stream.language)
        return seen
