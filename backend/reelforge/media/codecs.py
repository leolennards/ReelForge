"""Codec and container vocabulary shared by probing, compatibility and planning.

FFprobe reports codecs with its own internal names (``hevc``, ``dts``,
``hdmv_pgs_subtitle``...). Everything in ReelForge uses those names so that
probe output can be compared directly with device profiles. This module also
records which streams each *output* container can hold, which is a property
of the container format (and of FFmpeg's muxers), not of any TV.
"""

from __future__ import annotations

# --- Friendly labels -------------------------------------------------------

VIDEO_LABELS: dict[str, str] = {
    "h264": "H.264 (AVC)",
    "hevc": "H.265 (HEVC)",
    "av1": "AV1",
    "vp9": "VP9",
    "vp8": "VP8",
    "mpeg4": "MPEG-4 Part 2 (DivX/Xvid)",
    "mpeg2video": "MPEG-2",
    "mpeg1video": "MPEG-1",
    "vc1": "VC-1",
    "wmv3": "WMV 9",
    "msmpeg4v3": "MS MPEG-4 v3",
    "mjpeg": "Motion JPEG",
    "prores": "Apple ProRes",
    "theora": "Theora",
}

AUDIO_LABELS: dict[str, str] = {
    "aac": "AAC",
    "ac3": "Dolby Digital (AC-3)",
    "eac3": "Dolby Digital Plus (E-AC-3)",
    "truehd": "Dolby TrueHD",
    "dts": "DTS",
    "mp3": "MP3",
    "mp2": "MPEG Audio Layer II",
    "flac": "FLAC",
    "alac": "Apple Lossless",
    "opus": "Opus",
    "vorbis": "Vorbis",
    "wmav2": "WMA",
    "wmapro": "WMA Pro",
    "pcm_s16le": "PCM (16-bit)",
    "pcm_s24le": "PCM (24-bit)",
    "pcm_bluray": "PCM (Blu-ray)",
    "pcm_dvd": "PCM (DVD)",
}

SUBTITLE_LABELS: dict[str, str] = {
    "subrip": "SRT (SubRip)",
    "ass": "ASS/SSA (styled text)",
    "ssa": "SSA (styled text)",
    "webvtt": "WebVTT",
    "mov_text": "MP4 timed text",
    "text": "Plain text",
    "hdmv_pgs_subtitle": "PGS (Blu-ray image)",
    "dvd_subtitle": "VobSub (DVD image)",
    "dvb_subtitle": "DVB (image)",
    "eia_608": "Closed captions (EIA-608)",
}

TEXT_SUBTITLES = {"subrip", "ass", "ssa", "webvtt", "mov_text", "text"}
BITMAP_SUBTITLES = {"hdmv_pgs_subtitle", "dvd_subtitle", "dvb_subtitle", "xsub"}

# Pixel formats above 8 bits per channel. H.264 at 10-bit ("Hi10P") is
# rarely hardware-decoded by TVs, so the compatibility engine flags it.
HIGH_BIT_DEPTH_HINTS = ("10le", "10be", "12le", "12be", "p010", "p016")

HDR_TRANSFERS = {"smpte2084", "arib-std-b67"}


def codec_label(codec: str | None, profile: str | None = None) -> str:
    if not codec:
        return "Unknown"
    if codec == "dts" and profile:
        # ffprobe reports e.g. "DTS-HD MA", "DTS-HD HRA", "DTS-ES", "DTS"
        return profile if profile.upper().startswith("DTS") else f"DTS ({profile})"
    for table in (VIDEO_LABELS, AUDIO_LABELS, SUBTITLE_LABELS):
        if codec in table:
            return table[codec]
    return codec.upper()


# --- Containers ------------------------------------------------------------

CONTAINER_LABELS: dict[str, str] = {
    "mp4": "MP4",
    "mkv": "Matroska (MKV)",
    "mov": "QuickTime (MOV)",
    "m4v": "M4V",
    "avi": "AVI",
    "webm": "WebM",
    "mpeg": "MPEG program stream",
    "ts": "MPEG transport stream",
    "wmv": "Windows Media (ASF)",
    "flv": "Flash Video",
}

SUPPORTED_IMPORT_EXTENSIONS = {
    ".mkv",
    ".mp4",
    ".mov",
    ".avi",
    ".m4v",
    ".webm",
    ".mpg",
    ".mpeg",
    ".ts",
    ".m2ts",
    ".wmv",
}

# Containers ReelForge can write. Kept deliberately small: these two cover
# practically every TV and give predictable muxing behaviour.
OUTPUT_CONTAINERS = ("mp4", "mkv")

# Which codecs each output container can carry when muxed by FFmpeg without
# experimental flags.
CONTAINER_CAPS: dict[str, dict[str, set[str]]] = {
    "mp4": {
        "video": {"h264", "hevc", "av1", "vp9", "mpeg4", "mpeg2video", "mpeg1video"},
        "audio": {"aac", "ac3", "eac3", "mp3", "alac", "opus", "flac"},
        "subtitle": {"mov_text"},
    },
    "mkv": {
        "video": {
            "h264",
            "hevc",
            "av1",
            "vp9",
            "vp8",
            "mpeg4",
            "mpeg2video",
            "mpeg1video",
            "vc1",
            "theora",
            "prores",
            "mjpeg",
        },
        "audio": {
            "aac",
            "ac3",
            "eac3",
            "truehd",
            "dts",
            "mp3",
            "mp2",
            "flac",
            "alac",
            "opus",
            "vorbis",
            "pcm_s16le",
            "pcm_s24le",
        },
        "subtitle": {"subrip", "ass", "ssa", "webvtt", "hdmv_pgs_subtitle", "dvd_subtitle"},
    },
}


def container_from_probe(format_name: str | None, extension: str, major_brand: str | None) -> str:
    """Map ffprobe's ``format_name`` to a ReelForge container id.

    ffprobe groups related formats (``mov,mp4,m4a,3gp,3g2,mj2``), so the file
    extension and the MP4 brand are used to tell MOV, M4V and MP4 apart.
    """
    names = set((format_name or "").split(","))
    ext = extension.lower().lstrip(".")
    if "matroska" in names or "webm" in names:
        return "webm" if ext == "webm" else "mkv"
    if "mov" in names or "mp4" in names:
        brand = (major_brand or "").strip().lower()
        if brand == "qt" or ext == "mov":
            return "mov"
        if ext == "m4v":
            return "m4v"
        return "mp4"
    if "avi" in names:
        return "avi"
    if "mpegts" in names:
        return "ts"
    if "mpeg" in names or "mpegvideo" in names:
        return "mpeg"
    if "asf" in names:
        return "wmv"
    if "flv" in names:
        return "flv"
    return ext or "unknown"


def can_store(container: str, kind: str, codec: str) -> bool:
    return codec in CONTAINER_CAPS.get(container, {}).get(kind, set())


# --- Encoders ReelForge is allowed to use ----------------------------------

# Whitelisted video encoders, keyed by the codec they produce. Only these
# names can ever reach an FFmpeg command line.
VIDEO_ENCODERS: dict[str, dict[str, str]] = {
    "h264": {
        "software": "libx264",
        "videotoolbox": "h264_videotoolbox",
        "nvenc": "h264_nvenc",
        "qsv": "h264_qsv",
        "amf": "h264_amf",
    },
    "hevc": {
        "software": "libx265",
        "videotoolbox": "hevc_videotoolbox",
        "nvenc": "hevc_nvenc",
        "qsv": "hevc_qsv",
        "amf": "hevc_amf",
    },
}

AUDIO_ENCODERS: dict[str, str] = {
    "aac": "aac",
    "ac3": "ac3",
    "eac3": "eac3",
    "mp3": "libmp3lame",
}

# Channel limits imposed by the encoders themselves.
AUDIO_ENCODER_MAX_CHANNELS = {"aac": 8, "ac3": 6, "eac3": 8, "mp3": 2}

AUDIO_BITRATE_LIMITS_KBPS = {"aac": (64, 640), "ac3": (96, 640), "eac3": (96, 1536), "mp3": (64, 320)}


def default_audio_bitrate_kbps(codec: str, channels: int) -> int:
    if codec == "mp3":
        return 192
    if channels <= 2:
        return 192
    if codec == "aac":
        return 384
    return 640 if codec == "ac3" else 768
