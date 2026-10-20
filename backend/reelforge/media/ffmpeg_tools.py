"""Locating FFmpeg/FFprobe and discovering what the local build can do."""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field

from ..config import Settings
from .codecs import AUDIO_ENCODERS, VIDEO_ENCODERS

log = logging.getLogger(__name__)

INSTALL_HINTS = {
    "darwin": "Install it with Homebrew: brew install ffmpeg",
    "win32": "Install it with winget: winget install --id Gyan.FFmpeg  (then restart the terminal)",
    "linux": "Install it with your package manager, for example: sudo apt install ffmpeg",
}


def install_hint() -> str:
    return INSTALL_HINTS.get(sys.platform, INSTALL_HINTS["linux"])


@dataclass
class FFmpegStatus:
    ffmpeg_path: str | None = None
    ffprobe_path: str | None = None
    version: str | None = None
    encoders: set[str] = field(default_factory=set)
    # Hardware encoders that were listed *and* passed a tiny test encode.
    hardware_encoders: set[str] = field(default_factory=set)
    error: str | None = None

    @property
    def available(self) -> bool:
        return bool(self.ffmpeg_path and self.ffprobe_path and self.error is None)

    def to_public(self) -> dict:
        return {
            "available": self.available,
            "ffmpeg_found": self.ffmpeg_path is not None,
            "ffprobe_found": self.ffprobe_path is not None,
            "version": self.version,
            "video_encoders": sorted(
                name
                for codecs in VIDEO_ENCODERS.values()
                for name in codecs.values()
                if name in self.encoders
            ),
            "audio_encoders": sorted(n for n in AUDIO_ENCODERS.values() if n in self.encoders),
            "hardware_encoders": sorted(self.hardware_encoders),
            "error": self.error,
            "install_hint": None if self.available else install_hint(),
        }


def _resolve(explicit: str | None, name: str) -> str | None:
    if explicit:
        found = shutil.which(explicit)
        return found
    return shutil.which(name)


def _run(args: list[str], timeout: float = 15) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args, capture_output=True, text=True, timeout=timeout, check=False, stdin=subprocess.DEVNULL
    )


def _hardware_works(ffmpeg: str, encoder: str) -> bool:
    """Run a fraction-of-a-second encode to confirm the hardware encoder works.

    Listing an encoder only means FFmpeg was compiled with it; the GPU or
    driver may still be missing.
    """
    try:
        result = _run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=black:s=320x240:r=24:d=0.25",
                "-c:v",
                encoder,
                "-f",
                "null",
                "-",
            ],
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def detect_ffmpeg(settings: Settings, test_hardware: bool = True) -> FFmpegStatus:
    status = FFmpegStatus(
        ffmpeg_path=_resolve(settings.ffmpeg_path, "ffmpeg"),
        ffprobe_path=_resolve(settings.ffprobe_path, "ffprobe"),
    )
    if not status.ffmpeg_path or not status.ffprobe_path:
        missing = [n for n, p in (("FFmpeg", status.ffmpeg_path), ("FFprobe", status.ffprobe_path)) if not p]
        status.error = f"{' and '.join(missing)} not found on this computer."
        return status

    try:
        version = _run([status.ffmpeg_path, "-hide_banner", "-version"])
        first_line = (version.stdout or "").splitlines()[:1]
        match = re.search(r"version\s+(\S+)", first_line[0]) if first_line else None
        status.version = match.group(1) if match else None

        encoders = _run([status.ffmpeg_path, "-hide_banner", "-encoders"])
        for line in (encoders.stdout or "").splitlines():
            parts = line.split()
            # Lines look like: " V....D libx264   libx264 H.264 ..."
            if len(parts) >= 2 and len(parts[0]) == 6 and parts[0][0] in "VAS":
                status.encoders.add(parts[1])
    except (OSError, subprocess.TimeoutExpired) as exc:
        status.error = f"FFmpeg was found but could not be run: {exc}"
        return status

    if test_hardware:
        for codec_encoders in VIDEO_ENCODERS.values():
            for kind, encoder in codec_encoders.items():
                if (
                    kind != "software"
                    and encoder in status.encoders
                    and _hardware_works(status.ffmpeg_path, encoder)
                ):
                    status.hardware_encoders.add(encoder)

    log.info(
        "ffmpeg detected",
        extra={"version": status.version, "hardware": sorted(status.hardware_encoders)},
    )
    return status
