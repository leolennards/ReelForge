from pathlib import Path

import pytest
from conftest import audio, media, subtitle, video

from reelforge.compat.profiles import BUILTIN_BY_ID
from reelforge.planning.command import CommandError, build_command
from reelforge.planning.options import ConversionOptions
from reelforge.planning.planner import plan_conversion

ENCODERS = {"libx264", "libx265", "aac", "ac3"}


def make_plan(info, profile="universal", **opts):
    return plan_conversion(info, BUILTIN_BY_ID[profile], ConversionOptions(**opts), ENCODERS, set())


def test_audio_fix_command_copies_video_and_encodes_audio():
    p = make_plan(media("mkv", audios=[audio("dts", channels=6)]))
    args = build_command("ffmpeg", Path("/in/movie.mkv"), p, Path("/out/movie.mp4"))
    assert args[0] == "ffmpeg"
    assert "-progress" in args and args[args.index("-progress") + 1] == "pipe:1"
    assert args[args.index("-c:v:0") + 1] == "copy"
    assert args[args.index("-c:a:0") + 1] == "aac"
    assert args[args.index("-ac:a:0") + 1] == "6"
    assert args[args.index("-i") + 1] == "file:/in/movie.mkv"
    assert args[-1] == "file:/out/movie.mp4"


def test_hostile_filenames_stay_single_arguments():
    nasty = Path("/in/$(rm -rf ~); `echo pwned` | concat:evil.mkv")
    p = make_plan(media("mkv"))
    args = build_command("ffmpeg", nasty, p, Path("/out/-y.mp4"))
    assert f"file:{nasty}" in args
    assert "file:/out/-y.mp4" in args
    assert not any(a.startswith("concat:") for a in args)


def test_hevc_copy_into_mp4_gets_hvc1_tag():
    info = media("mkv", videos=[video("hevc")], audios=[audio("dts")])
    p = plan_conversion(info, BUILTIN_BY_ID["samsung"], ConversionOptions(container="mp4"), ENCODERS, set())
    args = build_command("ffmpeg", Path("a.mkv"), p, Path("b.mp4"))
    assert args[args.index("-tag:v:0") + 1] == "hvc1"


def test_full_conversion_command():
    p = make_plan(media("avi", videos=[video("vc1", width=3840, height=2160)]), quality="high")
    args = build_command("ffmpeg", Path("a.avi"), p, Path("b.mp4"))
    assert args[args.index("-c:v:0") + 1] == "libx264"
    assert args[args.index("-crf:v:0") + 1] == "18"
    assert "force_original_aspect_ratio=decrease" in args[args.index("-filter:v:0") + 1]


def test_subtitle_and_external_srt_outputs():
    info = media("mkv", subs=[subtitle("subrip", index=2)])
    p = make_plan(info, external_srt=True)
    args = build_command("ffmpeg", Path("a.mkv"), p, Path("b.mp4"), Path("b.srt"))
    assert args[args.index("-c:s:0") + 1] == "mov_text"
    assert args[-1] == "file:b.srt"


def test_tampered_plan_is_rejected():
    p = make_plan(media("avi", videos=[video("vc1")]))
    p.video_encode.encoder = "lavfi; rm -rf /"
    with pytest.raises(CommandError):
        build_command("ffmpeg", Path("a.avi"), p, Path("b.mp4"))
    p2 = make_plan(media("avi", videos=[video("vc1")]))
    p2.video_encode.preset = "placebo -f"
    with pytest.raises(CommandError):
        build_command("ffmpeg", Path("a.avi"), p2, Path("b.mp4"))


def test_plan_without_conversion_cannot_be_built():
    with pytest.raises(CommandError):
        build_command("ffmpeg", Path("a.mp4"), make_plan(media("mp4")), Path("b.mp4"))


def test_metadata_and_chapters_can_be_stripped():
    p = make_plan(media("mkv"), keep_metadata=False, keep_chapters=False)
    args = build_command("ffmpeg", Path("a.mkv"), p, Path("b.mp4"))
    assert args[args.index("-map_metadata") + 1] == "-1"
    assert args[args.index("-map_chapters") + 1] == "-1"


def test_options_reject_values_outside_whitelist():
    with pytest.raises(ValueError):
        ConversionOptions(video_codec="libx264 -vf evil")
    with pytest.raises(ValueError):
        ConversionOptions(crf=99)
