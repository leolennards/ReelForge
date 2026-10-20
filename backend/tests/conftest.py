from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from media_factory import HAVE_FFMPEG, make  # noqa: E402

from reelforge.config import Settings  # noqa: E402
from reelforge.media.codecs import codec_label  # noqa: E402
from reelforge.media.models import AudioStream, MediaInfo, SubtitleStream, VideoStream  # noqa: E402

CLIENT = {"X-ReelForge-Client": "1"}

needs_ffmpeg = pytest.mark.skipif(not HAVE_FFMPEG, reason="FFmpeg/FFprobe not installed")


def video(codec: str = "h264", **kw) -> VideoStream:
    defaults = dict(
        index=0,
        codec=codec,
        codec_label=codec_label(codec),
        width=1920,
        height=1080,
        fps=23.976,
        bit_depth=8,
        bitrate=8_000_000,
    )
    return VideoStream(**{**defaults, **kw})


def audio(codec: str = "aac", index: int = 1, **kw) -> AudioStream:
    profile = kw.pop("profile", None)
    defaults = dict(
        index=index,
        codec=codec,
        codec_label=codec_label(codec, profile),
        profile=profile,
        channels=2,
        sample_rate=48000,
        bitrate=192_000,
        language="eng",
        default=index == 1,
    )
    return AudioStream(**{**defaults, **kw})


def subtitle(codec: str = "subrip", index: int = 2, **kw) -> SubtitleStream:
    kind = "bitmap" if codec in ("hdmv_pgs_subtitle", "dvd_subtitle") else "text"
    defaults = dict(index=index, codec=codec, codec_label=codec_label(codec), kind=kind, language="eng")
    return SubtitleStream(**{**defaults, **kw})


def media(container: str = "mkv", videos=None, audios=None, subs=None, **kw) -> MediaInfo:
    videos = [video()] if videos is None else videos
    audios = [audio()] if audios is None else audios
    info = MediaInfo(
        container=container,
        container_label=container.upper(),
        size=kw.pop("size", 2_000_000_000),
        duration=kw.pop("duration", 7200.0),
        video=videos,
        audio=audios,
        subtitles=subs or [],
        primary_video=videos[0].index if videos else None,
        primary_audio=next((a.index for a in audios if a.default), audios[0].index if audios else None),
        **kw,
    )
    return info


@pytest.fixture(scope="session")
def samples(tmp_path_factory) -> dict[str, Path]:
    if not HAVE_FFMPEG:
        pytest.skip("FFmpeg/FFprobe not installed")
    directory = tmp_path_factory.mktemp("samples")
    kinds = ["h264_aac_mp4", "h264_dts_mkv", "h264_aac_mkv", "video_only", "subs_mkv", "corrupt"]
    return {k: make(k, directory) for k in kinds}


@pytest.fixture
def settings(tmp_path, samples) -> Settings:
    return Settings(
        data_dir=tmp_path / "data",
        media_dirs=[samples["h264_aac_mp4"].parent],
        output_roots=[tmp_path / "out"],
        default_output_dir=tmp_path / "out",
        min_free_bytes=0,
    )


@pytest.fixture
def plain_settings(tmp_path) -> Settings:
    """Settings for API tests that don't need generated media."""
    media_dir = tmp_path / "library"
    media_dir.mkdir()
    return Settings(
        data_dir=tmp_path / "data",
        media_dirs=[media_dir],
        output_roots=[tmp_path / "out"],
        default_output_dir=tmp_path / "out",
        min_free_bytes=0,
    )
