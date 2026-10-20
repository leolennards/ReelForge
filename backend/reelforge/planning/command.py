"""Turn a ConversionPlan into an FFmpeg argument list.

The result is always a list of separate arguments passed straight to the
process (never through a shell). Every codec, encoder and option that ends up
here comes from whitelists in ``media.codecs`` and the planner; file paths are
prefixed with ``file:`` so a name can never be read as an FFmpeg protocol.
"""

from __future__ import annotations

from pathlib import Path

from ..media.codecs import AUDIO_ENCODERS, VIDEO_ENCODERS
from .planner import ConversionPlan, StreamAction

ALLOWED_VIDEO_ENCODERS = {e for family in VIDEO_ENCODERS.values() for e in family.values()}
ALLOWED_AUDIO_ENCODERS = set(AUDIO_ENCODERS.values())
ALLOWED_SUBTITLE_CODECS = {"mov_text", "subrip", "ass", "ssa", "webvtt", "copy"}
ALLOWED_PRESETS = {"veryfast", "faster", "fast", "medium", "slow"}
ALLOWED_PIX_FMTS = {"yuv420p", "yuv420p10le", "p010le"}


class CommandError(ValueError):
    pass


def _media_path(path: Path) -> str:
    return f"file:{path}"


def build_command(
    ffmpeg: str,
    source: Path,
    plan: ConversionPlan,
    output: Path,
    srt_output: Path | None = None,
) -> list[str]:
    if not plan.needed:
        raise CommandError("This plan doesn't require a conversion.")
    if plan.errors:
        raise CommandError(plan.errors[0])

    args: list[str] = [
        ffmpeg,
        "-hide_banner",
        "-nostdin",
        "-y",  # only ever writes to ReelForge's own temporary file
        "-loglevel",
        "error",
        "-progress",
        "pipe:1",
        "-nostats",
        "-i",
        _media_path(source),
    ]

    kept = [a for a in plan.actions if a.action != "drop"]
    order = {"video": 0, "audio": 1, "subtitle": 2}
    kept.sort(key=lambda a: (order[a.kind], a.source_index))
    for action in kept:
        args += ["-map", f"0:{action.source_index}"]
    if plan.copy_attachments:
        args += ["-map", "0:t?"]

    args += ["-map_metadata", "0" if plan.keep_metadata else "-1"]
    args += ["-map_chapters", "0" if plan.keep_chapters else "-1"]

    counters = {"video": 0, "audio": 0, "subtitle": 0}
    for action in kept:
        n = counters[action.kind]
        counters[action.kind] += 1
        if action.kind == "video":
            args += _video_args(plan, action, n)
        elif action.kind == "audio":
            args += _audio_args(action, n)
        else:
            args += _subtitle_args(action, n)
    if plan.copy_attachments:
        args += ["-c:t", "copy"]

    if plan.container == "mp4":
        args += ["-f", "mp4"]
    else:
        args += ["-f", "matroska"]
    args.append(_media_path(output))

    if srt_output is not None and plan.external_srt_index is not None:
        args += [
            "-map",
            f"0:{plan.external_srt_index}",
            "-c:s",
            "srt",
            "-f",
            "srt",
            _media_path(srt_output),
        ]
    return args


def _video_args(plan: ConversionPlan, action: StreamAction, n: int) -> list[str]:
    if action.action == "copy":
        args = [f"-c:v:{n}", "copy"]
        if plan.container == "mp4" and action.target_codec == "hevc":
            # The hvc1 tag is what Apple devices and many TVs expect for HEVC in MP4.
            args += [f"-tag:v:{n}", "hvc1"]
        return args

    enc = plan.video_encode
    if enc is None or enc.encoder not in ALLOWED_VIDEO_ENCODERS:
        raise CommandError("Video encoder is not allowed.")
    if enc.pix_fmt not in ALLOWED_PIX_FMTS:
        raise CommandError("Pixel format is not allowed.")
    args = [f"-c:v:{n}", enc.encoder]

    filters: list[str] = []
    if enc.scale:
        w, h = (int(v) for v in enc.scale)
        filters.append(f"scale=w={w}:h={h}:force_original_aspect_ratio=decrease:force_divisible_by=2")
    if enc.fps:
        filters.append(f"fps={float(enc.fps):g}")
    if filters:
        args += [f"-filter:v:{n}", ",".join(filters)]
    args += [f"-pix_fmt:v:{n}", enc.pix_fmt]

    if enc.encoder.endswith("_videotoolbox"):
        args += [f"-q:v:{n}", str(int(enc.quality or 60))]
    elif enc.encoder.endswith("_nvenc"):
        args += ["-rc", "vbr", "-cq", str(int(enc.crf or 21)), "-b:v", "0", "-preset", "p5"]
    elif enc.encoder.endswith("_qsv"):
        args += ["-global_quality", str(int(enc.crf or 21))]
    elif enc.encoder.endswith("_amf"):
        q = str(int(enc.crf or 21))
        args += ["-rc", "cqp", "-qp_i", q, "-qp_p", q]
    else:
        if enc.preset not in ALLOWED_PRESETS:
            raise CommandError("Encoder preset is not allowed.")
        args += [f"-crf:v:{n}", str(int(enc.crf or 20)), "-preset", enc.preset]
        if enc.encoder == "libx265":
            args += ["-x265-params", "log-level=error"]
    if enc.codec == "hevc" and plan.container == "mp4":
        args += [f"-tag:v:{n}", "hvc1"]
    return args


def _audio_args(action: StreamAction, n: int) -> list[str]:
    if action.action == "copy":
        return [f"-c:a:{n}", "copy"]
    encoder = AUDIO_ENCODERS.get(action.target_codec or "")
    if encoder not in ALLOWED_AUDIO_ENCODERS:
        raise CommandError("Audio encoder is not allowed.")
    args = [f"-c:a:{n}", encoder]
    if action.bitrate_kbps:
        args += [f"-b:a:{n}", f"{int(action.bitrate_kbps)}k"]
    if action.channels:
        args += [f"-ac:a:{n}", str(int(action.channels))]
    return args


def _subtitle_args(action: StreamAction, n: int) -> list[str]:
    codec = "copy" if action.action == "copy" else (action.target_codec or "")
    if codec not in ALLOWED_SUBTITLE_CODECS:
        raise CommandError("Subtitle format is not allowed.")
    return [f"-c:s:{n}", codec]
