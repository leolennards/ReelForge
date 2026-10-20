from conftest import audio, media, subtitle, video

from reelforge.compat.engine import FAT32_MAX_FILE_BYTES, assess, check_video, tv_ready_check
from reelforge.compat.profiles import BUILTIN_BY_ID, BUILTIN_PROFILES, DeviceProfile

UNIVERSAL = BUILTIN_BY_ID["universal"]
SAMSUNG = BUILTIN_BY_ID["samsung"]
LG = BUILTIN_BY_ID["lg"]


def test_builtin_profiles_are_valid_and_unique():
    ids = [p.id for p in BUILTIN_PROFILES]
    assert len(ids) == len(set(ids))
    for p in BUILTIN_PROFILES:
        DeviceProfile.model_validate(p.model_dump())
        assert any("not an official specification" in n for n in p.notes)


def test_h264_aac_mp4_is_likely_compatible():
    report = assess(media("mp4"), UNIVERSAL)
    assert report.overall == "likely_compatible"
    assert report.overall_label == "Likely compatible"


def test_dts_audio_needs_conversion_on_samsung():
    info = media(
        "mkv",
        videos=[video("hevc", bit_depth=10, width=3840, height=2160)],
        audios=[audio("dts", profile="DTS-HD MA", channels=8)],
    )
    report = assess(info, SAMSUNG)
    assert report.overall == "audio_conversion"
    assert report.areas["video"].status == "compatible"
    assert "DTS-HD MA" in " ".join(report.areas["audio"].reasons)


def test_dts_is_uncertain_on_lg():
    report = assess(media("mkv", audios=[audio("dts", channels=6)]), LG)
    assert report.areas["audio"].status == "uncertain"
    assert report.overall == "audio_conversion"


def test_unsupported_video_codec():
    report = assess(media("avi", videos=[video("vc1")]), UNIVERSAL)
    assert report.overall == "video_conversion"


def test_high_bit_depth_h264_is_flagged():
    check = check_video(video("h264", bit_depth=10), SAMSUNG)
    assert check.support == "unsupported"
    assert "10-bit" in check.reasons[0]


def test_resolution_above_profile_limit():
    check = check_video(video("h264", width=3840, height=2160), UNIVERSAL)
    assert check.support == "unsupported"


def test_container_only_issue_recommends_remux():
    report = assess(media("mkv"), UNIVERSAL)
    assert report.overall == "remux_recommended"


def test_missing_audio_is_reported():
    report = assess(media("mp4", audios=[]), UNIVERSAL)
    assert report.areas["audio"].status == "missing"
    assert "silently" in report.areas["audio"].reasons[0]


def test_bitmap_subtitles_are_uncertain_not_blocking():
    report = assess(media("mp4", subs=[subtitle("hdmv_pgs_subtitle")]), UNIVERSAL)
    assert report.areas["subtitles"].status == "uncertain"
    assert report.overall == "uncertain"


def test_tv_ready_check_flags_fat32_limit():
    info = media("mp4", size=FAT32_MAX_FILE_BYTES + 1)
    items = {i.key: i for i in tv_ready_check(info, UNIVERSAL)}
    assert items["file_size"].status == "warn"
    assert "FAT32" in items["file_size"].detail
    small = {i.key: i for i in tv_ready_check(media("mp4", size=FAT32_MAX_FILE_BYTES), UNIVERSAL)}
    assert small["file_size"].status == "pass"


def test_tv_ready_check_can_skip_size_check():
    keys = {i.key for i in tv_ready_check(media("mp4"), UNIVERSAL, fs_limit_bytes=None)}
    assert "file_size" not in keys


def test_custom_profile_validation():
    data = UNIVERSAL.model_dump() | {"id": "my-tv", "builtin": False}
    DeviceProfile.model_validate(data)
    bad = data | {"preferred_audio_codec": "ac3"}
    try:
        DeviceProfile.model_validate(bad)
    except ValueError as exc:
        assert "preferred audio" in str(exc)
    else:
        raise AssertionError("expected a validation error")
    try:
        DeviceProfile.model_validate(data | {"video_codecs": ["h264", "rm -rf"]})
    except ValueError as exc:
        assert "Unknown video codec" in str(exc)
    else:
        raise AssertionError("expected a validation error")
