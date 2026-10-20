"""Generates tiny synthetic movies with FFmpeg's built-in test sources.

No real films are used or redistributed; every sample is a few seconds of
colour bars and a sine tone created on the fly.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")
HAVE_FFMPEG = bool(FFMPEG and FFPROBE)

SRT = """1
00:00:00,500 --> 00:00:01,500
Hello from ReelForge

2
00:00:01,800 --> 00:00:02,800
Second line
"""


def _run(args: list[str]) -> None:
    subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args],
        check=True,
        capture_output=True,
        timeout=120,
    )


def _video(seconds: float, size: str = "320x240", rate: int = 24) -> list[str]:
    return ["-f", "lavfi", "-i", f"testsrc2=size={size}:rate={rate}:duration={seconds}"]


def _audio(seconds: float, layout: str = "stereo") -> list[str]:
    return [
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency=440:sample_rate=48000:duration={seconds},aformat=channel_layouts={layout}",
    ]


def make(kind: str, directory: Path, seconds: float = 3.0) -> Path:
    """Create a sample of ``kind`` in ``directory`` and return its path."""
    directory.mkdir(parents=True, exist_ok=True)
    if kind == "h264_aac_mp4":
        out = directory / "compatible.mp4"
        _run(
            [
                *_video(seconds),
                *_audio(seconds),
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-shortest",
                str(out),
            ]
        )
    elif kind == "h264_dts_mkv":
        out = directory / "dts audio.mkv"
        _run(
            [
                *_video(seconds),
                *_audio(seconds, "5.1"),
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "dca",
                "-strict",
                "-2",
                "-shortest",
                str(out),
            ]
        )
    elif kind == "h264_aac_mkv":
        out = directory / "wrong container.mkv"
        _run(
            [
                *_video(seconds),
                *_audio(seconds),
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
                str(out),
            ]
        )
    elif kind == "mpeg4_mp3_avi":
        out = directory / "old movie.avi"
        _run(
            [
                *_video(seconds),
                *_audio(seconds),
                "-c:v",
                "mpeg4",
                "-q:v",
                "5",
                "-c:a",
                "libmp3lame",
                "-shortest",
                str(out),
            ]
        )
    elif kind == "vp9_opus_webm":
        out = directory / "web clip.webm"
        _run(
            [
                *_video(seconds),
                *_audio(seconds),
                "-c:v",
                "libvpx-vp9",
                "-deadline",
                "realtime",
                "-cpu-used",
                "8",
                "-b:v",
                "200k",
                "-c:a",
                "libopus",
                "-shortest",
                str(out),
            ]
        )
    elif kind == "video_only":
        out = directory / "silent.mp4"
        _run([*_video(seconds), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(out)])
    elif kind == "subs_mkv":
        srt = directory / "subs.srt"
        srt.write_text(SRT)
        out = directory / "with subtitles.mkv"
        _run(
            [
                *_video(seconds),
                *_audio(seconds),
                "-i",
                str(srt),
                "-i",
                str(srt),
                "-map",
                "0:v",
                "-map",
                "1:a",
                "-map",
                "2:s",
                "-map",
                "3:s",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-c:s:0",
                "srt",
                "-c:s:1",
                "ass",
                "-metadata:s:s:0",
                "language=eng",
                "-metadata:s:s:1",
                "language=fra",
                "-shortest",
                str(out),
            ]
        )
    elif kind == "corrupt":
        out = directory / "broken.mkv"
        out.write_bytes(b"\x1a\x45\xdf\xa3" + bytes(range(256)) * 64)
    else:
        raise ValueError(kind)
    return out
