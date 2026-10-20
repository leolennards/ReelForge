"""Paths, progress parsing and output validation."""

import os
from pathlib import Path

import pytest
from conftest import audio, media, video

from reelforge.compat.profiles import BUILTIN_BY_ID
from reelforge.jobs.manager import friendly_ffmpeg_error
from reelforge.jobs.progress import ProgressState
from reelforge.jobs.validate import validate_output
from reelforge.paths import PathNotAllowed, resolve_within, safe_filename, unique_path
from reelforge.planning.options import ConversionOptions
from reelforge.planning.planner import plan_conversion


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Movie (2019)", "Movie (2019)"),
        ("../../etc/passwd", "passwd"),
        ("C:\\Windows\\evil", "evil"),
        ('a<b>c:"d|e?*f', "a b c d e f"),
        ("CON", "movie"),
        ("   ...   ", "movie"),
        ("x" * 400, "x" * 150),
    ],
)
def test_safe_filename(raw, expected):
    assert safe_filename(raw) == expected


def test_resolve_within_blocks_traversal_and_symlinks(tmp_path):
    root = tmp_path / "root"
    (root / "sub").mkdir(parents=True)
    outside = tmp_path / "secret.txt"
    outside.write_text("secret")
    assert resolve_within(root / "sub", [root]) == (root / "sub").resolve()
    with pytest.raises(PathNotAllowed):
        resolve_within(root / ".." / "secret.txt", [root])
    link = root / "link.txt"
    os.symlink(outside, link)
    with pytest.raises(PathNotAllowed):
        resolve_within(link, [root])


def test_unique_path_never_overwrites(tmp_path):
    (tmp_path / "Movie.mp4").write_bytes(b"x")
    (tmp_path / "Movie (2).mp4").write_bytes(b"x")
    assert unique_path(tmp_path, "Movie", ".mp4") == tmp_path / "Movie (3).mp4"


def test_progress_parsing_and_percent():
    state = ProgressState(duration=100.0)
    for line in ["frame=10", "out_time_us=25000000", "speed=2.5x", "progress=continue"]:
        state.feed(line)
    assert state.percent == pytest.approx(25.0)
    assert state.speed == 2.5
    state.feed("out_time_us=N/A")
    state.feed("progress=end")
    assert state.finished and state.percent == 100.0


def test_progress_unknown_duration_reports_none():
    state = ProgressState(duration=None)
    state.feed("out_time_us=5000000")
    state.feed("progress=continue")
    assert state.percent is None
    assert state.eta_seconds is None


def _plan(info):
    return plan_conversion(info, BUILTIN_BY_ID["universal"], ConversionOptions(), {"libx264", "aac"}, set())


# Scenario 10
def test_validation_fails_when_streams_missing():
    source = media("mkv", audios=[audio("dts", channels=6)])
    plan = _plan(source)
    output = media("mp4", audios=[], duration=source.duration)
    result = validate_output(source, output, plan)
    assert not result.ok
    assert any(c.name == "Audio streams" and not c.ok for c in result.checks)


def test_validation_fails_on_wrong_codec_or_duration():
    source = media("mkv", audios=[audio("dts", channels=6)])
    plan = _plan(source)
    wrong_codec = media("mp4", audios=[audio("dts")], duration=source.duration)
    assert not validate_output(source, wrong_codec, plan).ok
    truncated = media("mp4", audios=[audio("aac")], duration=source.duration / 2)
    assert not validate_output(source, truncated, plan).ok
    good = media("mp4", videos=[video()], audios=[audio("aac")], duration=source.duration - 0.5)
    assert validate_output(source, good, plan).ok


def test_friendly_errors():
    assert "ran out of space" in friendly_ffmpeg_error(
        ["av_interleaved_write_frame(): No space left on device"]
    )
    assert "damaged" in friendly_ffmpeg_error(["Invalid data found when processing input"])
    assert "Details: boom" in friendly_ffmpeg_error(["", "boom"])


def test_path_object_is_not_a_string():
    # Guard against accidentally passing str paths into helpers expecting Path.
    assert isinstance(unique_path(Path("."), "zzz-not-there", ".mp4"), Path)
