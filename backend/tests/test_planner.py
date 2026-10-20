from conftest import audio, media, subtitle, video

from reelforge.compat.profiles import BUILTIN_BY_ID
from reelforge.planning.options import ConversionOptions
from reelforge.planning.planner import plan_conversion

UNIVERSAL = BUILTIN_BY_ID["universal"]
SAMSUNG = BUILTIN_BY_ID["samsung"]
ENCODERS = {"libx264", "libx265", "aac", "ac3", "eac3", "libmp3lame", "h264_videotoolbox"}
HW = {"h264_videotoolbox"}


def plan(info, profile=UNIVERSAL, **opts):
    return plan_conversion(info, profile, ConversionOptions(**opts), ENCODERS, HW)


def kinds(p, kind):
    return [a for a in p.actions if a.kind == kind]


# Scenario 1
def test_compatible_file_needs_no_reencoding():
    p = plan(media("mp4"))
    assert p.strategy == "none"
    assert p.needed is False
    assert all(a.action == "copy" for a in p.actions)


# Scenario 2
def test_dts_audio_converted_while_video_copied():
    info = media(
        "mkv",
        videos=[video("hevc", bit_depth=10, width=3840, height=2160)],
        audios=[audio("dts", profile="DTS-HD MA", channels=6, bitrate=None)],
    )
    p = plan(info, SAMSUNG)
    assert p.strategy == "audio_fix"
    assert p.container == "mkv"  # Samsung plays MKV: smallest change keeps it
    v = kinds(p, "video")[0]
    assert v.action == "copy"
    a = kinds(p, "audio")[0]
    assert a.action == "encode" and a.target_codec == "ac3" and a.channels == 6
    assert "keep the original video stream" in p.summary
    assert "DTS-HD MA" in p.summary


def test_audio_fix_does_not_downmix_unless_profile_requires():
    info = media("mkv", audios=[audio("dts", channels=6)])
    a = kinds(plan(info), "audio")[0]
    assert a.channels == 6
    assert not any("downmixed" in w for w in plan(info).warnings)


def test_downmix_is_warned_when_required():
    info = media("mkv", audios=[audio("truehd", channels=8)])
    p = plan(info)  # universal allows 6 channels
    assert kinds(p, "audio")[0].channels == 6
    assert any("downmixed" in w for w in p.warnings)


# Scenario 3
def test_compatible_streams_in_unsuitable_container_are_remuxed():
    p = plan(media("mkv"))
    assert p.strategy == "remux"
    assert p.container == "mp4"
    assert all(a.action == "copy" for a in p.actions)
    assert p.estimated_size is not None


def test_remux_impossible_when_stream_cannot_be_stored():
    info = media("mkv", audios=[audio("dts", channels=6)])
    p = plan(info, mode="remux", container="mp4")
    assert p.errors and "can't be stored" in p.errors[0]


# Scenario 4
def test_unsupported_video_codec_is_reencoded():
    p = plan(media("avi", videos=[video("vc1")], audios=[audio("mp3")]))
    assert p.strategy == "full"
    assert p.video_encode is not None
    assert p.video_encode.codec == "h264" and p.video_encode.encoder == "libx264"
    assert p.video_encode.crf == 20
    assert p.estimated_size is None and "can't be reliably predicted" in p.estimate_note


def test_reencode_downscales_to_profile_limit():
    p = plan(media("mkv", videos=[video("vc1", width=3840, height=2160)]))
    assert p.video_encode.scale == (1920, 1080)


def test_hardware_encoder_used_only_when_requested_and_working():
    info = media("avi", videos=[video("mpeg4")])
    assert plan(info).video_encode.hardware is False
    hw = plan(info, hardware_acceleration=True).video_encode
    assert hw.encoder == "h264_videotoolbox" and hw.quality is not None


def test_hdr_reencode_warns_about_colours():
    p = plan(media("mkv", videos=[video("vc1", hdr="HDR10", bit_depth=10)]))
    assert any("tone" in w for w in p.warnings)


# Scenario 5
def test_missing_audio_produces_warning():
    p = plan(media("mkv", audios=[]))
    assert any("no audio" in w for w in p.warnings)
    p2 = plan(media("mp4", audios=[]))
    assert p2.strategy == "none"
    assert any("no audio" in w for w in p2.warnings)


# Scenario 6
def test_bitmap_subtitles_dropped_from_mp4_with_warning():
    info = media("mkv", subs=[subtitle("hdmv_pgs_subtitle", index=2), subtitle("subrip", index=3)])
    p = plan(info)
    subs = {a.source_index: a for a in kinds(p, "subtitle")}
    assert subs[2].action == "drop"
    assert subs[3].action == "encode" and subs[3].target_codec == "mov_text"
    assert any("PGS" in w and "left out" in w for w in p.warnings)


def test_bitmap_subtitles_kept_in_mkv():
    info = media("mkv", audios=[audio("dts")], subs=[subtitle("hdmv_pgs_subtitle", index=2)])
    p = plan(info, SAMSUNG)
    assert p.container == "mkv"
    assert kinds(p, "subtitle")[0].action == "copy"


def test_ass_styling_loss_is_warned():
    p = plan(media("mkv", subs=[subtitle("ass", index=2)]))
    assert any("Styling" in w for w in p.warnings)


def test_external_srt_selected_from_text_subtitles():
    info = media("mkv", subs=[subtitle("hdmv_pgs_subtitle", index=2), subtitle("subrip", index=3)])
    assert plan(info, external_srt=True).external_srt_index == 3


def test_attachments_dropped_from_mp4_with_warning():
    p = plan(media("mkv", attachments=3))
    assert any("attachment" in w for w in p.warnings)


def test_other_audio_tracks_kept_by_default_and_warned_when_dropped():
    info = media("mkv", audios=[audio("aac", index=1), audio("ac3", index=2, language="fra", channels=6)])
    assert len([a for a in kinds(plan(info), "audio") if a.action != "drop"]) == 2
    p = plan(info, audio_tracks="primary")
    assert any("other audio track" in w for w in p.warnings)


def test_selected_audio_track_must_exist():
    p = plan(media("mkv"), audio_tracks="selected", audio_stream=42)
    assert p.errors


def test_custom_copy_with_resize_is_rejected():
    p = plan(media("mkv"), mode="custom", video_codec="copy", max_height=720)
    assert any("re-encoding" in e for e in p.errors)


def test_full_mode_forces_reencode():
    p = plan(media("mp4"), mode="full")
    assert p.strategy == "full" and p.video_encode is not None
