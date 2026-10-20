"""Conversion planning: choose the least destructive way to reach compatibility.

Decision order (mirrors the README):

1. Inspect the source (done by the caller; this module receives MediaInfo).
2. Keep the original video stream whenever the profile allows it.
3. Keep each audio track that is already compatible.
4. Convert only incompatible audio, without touching the video.
5. Change container only when the chosen container can hold every kept stream.
6. Re-encode video only when necessary or explicitly requested.
7. Report anything that grows the file, lowers quality, or drops data.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from ..compat.engine import check_audio, check_container, check_video
from ..compat.profiles import DeviceProfile
from ..media.codecs import (
    AUDIO_BITRATE_LIMITS_KBPS,
    AUDIO_ENCODER_MAX_CHANNELS,
    AUDIO_ENCODERS,
    CONTAINER_LABELS,
    OUTPUT_CONTAINERS,
    VIDEO_ENCODERS,
    can_store,
    codec_label,
    default_audio_bitrate_kbps,
)
from ..media.models import AudioStream, MediaInfo, SubtitleStream, VideoStream
from .options import ConversionOptions

Strategy = Literal["none", "remux", "audio_fix", "full", "custom"]

STRATEGY_LABELS: dict[str, str] = {
    "none": "No conversion needed",
    "remux": "Remux container",
    "audio_fix": "Fix audio only",
    "full": "Full compatibility conversion",
    "custom": "Custom conversion",
}

# Quality-based rate control values per encoder family. Lower = better quality.
CRF_TABLE = {
    "h264": {"high": 18, "balanced": 20, "compact": 23},
    "hevc": {"high": 20, "balanced": 22, "compact": 26},
}
# VideoToolbox uses -q:v (1-100, higher = better) instead of CRF.
VT_QUALITY = {"high": 70, "balanced": 60, "compact": 50}
HARDWARE_ORDER = ("videotoolbox", "nvenc", "qsv", "amf")


class StreamAction(BaseModel):
    kind: Literal["video", "audio", "subtitle"]
    source_index: int
    action: Literal["copy", "encode", "drop"]
    source_label: str
    target_codec: str | None = None
    target_label: str | None = None
    channels: int | None = None
    bitrate_kbps: int | None = None
    language: str | None = None
    reason: str = ""


class VideoEncode(BaseModel):
    codec: str
    encoder: str
    hardware: bool = False
    crf: int | None = None
    quality: int | None = None  # VideoToolbox -q:v
    preset: str | None = None
    scale: tuple[int, int] | None = None  # bounding box (w, h)
    fps: float | None = None
    pix_fmt: str = "yuv420p"


class ConversionPlan(BaseModel):
    strategy: Strategy
    strategy_label: str
    needed: bool
    container: Literal["mp4", "mkv"]
    extension: str
    actions: list[StreamAction]
    video_encode: VideoEncode | None = None
    keep_metadata: bool = True
    keep_chapters: bool = True
    copy_attachments: bool = False
    external_srt_index: int | None = None
    summary: str
    keeps: list[str] = []
    changes: list[str] = []
    warnings: list[str] = []
    errors: list[str] = []
    estimated_size: int | None = None
    estimate_note: str = ""

    @property
    def video_action(self) -> StreamAction | None:
        return next((a for a in self.actions if a.kind == "video"), None)

    def kept(self, kind: str) -> list[StreamAction]:
        return [a for a in self.actions if a.kind == kind and a.action != "drop"]


class PlanningError(Exception):
    pass


def _lang(stream: AudioStream | SubtitleStream | VideoStream) -> str:
    return f" ({stream.language})" if stream.language else ""


def _channels_text(n: int | None) -> str:
    return {1: "mono", 2: "stereo", 6: "5.1", 8: "7.1"}.get(n or 0, f"{n}-channel" if n else "")


def _audio_label(a: AudioStream) -> str:
    ch = _channels_text(a.channels)
    return f"{a.codec_label}{' ' + ch if ch else ''}{_lang(a)}"


def plan_conversion(
    info: MediaInfo,
    profile: DeviceProfile,
    opts: ConversionOptions,
    encoders: set[str],
    hardware_encoders: set[str],
) -> ConversionPlan:
    warnings: list[str] = []
    errors: list[str] = []
    keeps: list[str] = []
    changes: list[str] = []
    mode = opts.mode
    custom = mode == "custom"

    video = info.video_stream(info.primary_video)
    extra_video = [v for v in info.video if v.index != info.primary_video]

    # --- 1. Video: copy or re-encode? --------------------------------------
    target_h, target_w = _resolution_bounds(profile, opts)
    target_fps = _fps_cap(profile, opts)
    video_copy = True
    video_reason = ""
    if video is not None:
        vcheck = check_video(video, profile)
        needs_resize = bool(
            video.width and video.height and (video.width > target_w or video.height > target_h)
        )
        needs_fps = bool(video.fps and target_fps and video.fps > target_fps + 0.01)
        if mode in ("remux", "audio_only"):
            video_copy = True
            if vcheck.support == "unsupported":
                warnings.append(
                    "The video stream itself may not play on this device: "
                    + " ".join(vcheck.reasons)
                    + " Choose “Full compatibility conversion” to re-encode it."
                )
        elif mode == "full":
            video_copy = False
            video_reason = "Full conversion was selected."
        elif custom and opts.video_codec == "copy":
            video_copy = True
            if opts.max_height or opts.frame_rate != "keep":
                errors.append(
                    "Changing resolution or frame rate requires re-encoding the video. "
                    "Pick a video codec instead of “Keep original”."
                )
        elif custom and opts.video_codec in ("h264", "hevc"):
            video_copy = False
            video_reason = "A video codec was chosen in the custom settings."
        else:
            if (
                vcheck.support == "unsupported"
                or vcheck.support == "uncertain"
                and profile.priority == "compatibility"
            ):
                video_copy = False
                video_reason = " ".join(vcheck.reasons)
            elif vcheck.support == "uncertain":
                warnings.append(
                    " ".join(vcheck.reasons)
                    + " The original video is kept to preserve quality; choose full conversion "
                    "if it doesn't play."
                )
            if custom and (needs_resize or needs_fps or opts.frame_rate != "keep"):
                video_copy = False
                video_reason = video_reason or "Custom resolution or frame rate settings."
            if vcheck.support == "ok" and video.dolby_vision:
                warnings.extend(vcheck.reasons)

    # --- 2. Audio track selection and per-track decisions ------------------
    selected_audio, dropped_audio = _select_audio(info, opts, errors)
    target_audio = _target_audio_codec(profile, opts, encoders, warnings)
    audio_plans: list[tuple[AudioStream, bool, str]] = []  # (stream, copy?, reason)
    for a in selected_audio:
        copy, reason = _audio_copy_decision(a, profile, opts, target_audio)
        audio_plans.append((a, copy, reason))

    # --- 3. Recommended mode: is anything actually needed? -----------------
    container_ok = check_container(info.container, profile).support == "ok"
    if (
        mode == "recommended"
        and container_ok
        and video_copy
        and all(copy for _, copy, _ in audio_plans)
        and not dropped_audio
        and not errors
    ):
        return _no_conversion_plan(info, profile, warnings)

    # --- 4. Container ------------------------------------------------------
    copied_video = video.codec if (video is not None and video_copy) else None
    copied_audio = [a.codec for a, copy, _ in audio_plans if copy]
    container = _choose_container(info, profile, opts, copied_video, copied_audio)
    if container not in profile.containers:
        warnings.append(
            f"The {profile.name} profile doesn't list {CONTAINER_LABELS[container]} as supported."
        )

    actions: list[StreamAction] = []
    video_encode: VideoEncode | None = None

    # --- 5. Finalise video -------------------------------------------------
    if video is not None:
        if video_copy and not can_store(container, "video", video.codec):
            if mode == "remux":
                errors.append(
                    f"{video.codec_label} video can't be stored in "
                    f"{CONTAINER_LABELS[container]}, so a remux isn't possible."
                )
            else:
                video_copy = False
                video_reason = f"{video.codec_label} video can't be stored in {CONTAINER_LABELS[container]}."
        if video_copy:
            actions.append(
                StreamAction(
                    kind="video",
                    source_index=video.index,
                    action="copy",
                    source_label=video.codec_label,
                    target_codec=video.codec,
                    target_label=video.codec_label,
                    reason="Original video kept without re-encoding.",
                )
            )
            keeps.append(f"Original {video.codec_label} video (no quality loss)")
        else:
            video_encode = _video_encode(
                video,
                profile,
                opts,
                encoders,
                hardware_encoders,
                target_w,
                target_h,
                target_fps,
                errors,
                warnings,
            )
            if video_encode:
                label = codec_label(video_encode.codec)
                actions.append(
                    StreamAction(
                        kind="video",
                        source_index=video.index,
                        action="encode",
                        source_label=video.codec_label,
                        target_codec=video_encode.codec,
                        target_label=label,
                        reason=video_reason,
                    )
                )
                rc = (
                    f"quality {video_encode.quality}"
                    if video_encode.quality is not None
                    else f"CRF {video_encode.crf}"
                )
                hw = ", hardware accelerated" if video_encode.hardware else ""
                changes.append(f"Re-encode video from {video.codec_label} to {label} ({rc}{hw})")
                if video_encode.scale:
                    changes.append(
                        f"Downscale from {video.width}×{video.height} to fit "
                        f"{video_encode.scale[0]}×{video_encode.scale[1]}"
                    )
                if video_encode.fps:
                    changes.append(f"Change frame rate to {video_encode.fps:g} fps")
                warnings.append(
                    "Re-encoding video takes much longer than other strategies and slightly "
                    "reduces picture quality. The file may end up larger or smaller than the original."
                )
    else:
        warnings.append("This file has no video stream; only audio will be converted.")
    for v in extra_video:
        warnings.append(
            f"An additional {v.codec_label} video stream will be left out (only the main video is kept)."
        )

    # --- 6. Finalise audio -------------------------------------------------
    if not info.audio:
        warnings.append("This file has no audio track, so the converted movie will also be silent.")
    for a, copy, reason in audio_plans:
        if copy and not can_store(container, "audio", a.codec):
            if mode == "remux" or (custom and opts.audio_codec == "copy"):
                errors.append(
                    f"{a.codec_label} audio can't be stored in {CONTAINER_LABELS[container]}. "
                    "Choose MKV or convert the audio."
                )
                continue
            copy = False
            reason = f"{a.codec_label} audio can't be stored in {CONTAINER_LABELS[container]}."
        if copy:
            actions.append(
                StreamAction(
                    kind="audio",
                    source_index=a.index,
                    action="copy",
                    source_label=_audio_label(a),
                    target_codec=a.codec,
                    target_label=a.codec_label,
                    channels=a.channels,
                    language=a.language,
                    reason="Already compatible; kept as is.",
                )
            )
            keeps.append(f"Original {_audio_label(a)} audio")
            continue
        channels, downmix_note = _target_channels(a, profile, opts, target_audio)
        if downmix_note:
            warnings.append(downmix_note)
        bitrate = _audio_bitrate(target_audio, channels, opts)
        actions.append(
            StreamAction(
                kind="audio",
                source_index=a.index,
                action="encode",
                source_label=_audio_label(a),
                target_codec=target_audio,
                target_label=codec_label(target_audio),
                channels=channels,
                bitrate_kbps=bitrate,
                language=a.language,
                reason=reason,
            )
        )
        changes.append(
            f"Convert {_audio_label(a)} audio to {codec_label(target_audio)} "
            f"{_channels_text(channels)} at {bitrate} kb/s"
        )
    for a in dropped_audio:
        actions.append(
            StreamAction(
                kind="audio",
                source_index=a.index,
                action="drop",
                source_label=_audio_label(a),
                language=a.language,
                reason="Not selected.",
            )
        )
    if dropped_audio:
        warnings.append(
            f"{len(dropped_audio)} other audio track(s) will be left out: "
            + ", ".join(_audio_label(a) for a in dropped_audio)
            + "."
        )

    # --- 7. Subtitles, attachments, chapters, metadata ---------------------
    external_srt = _plan_subtitles(info, profile, opts, container, actions, keeps, changes, warnings)

    copy_attachments = container == "mkv" and info.attachments > 0
    if info.attachments and not copy_attachments:
        warnings.append(
            f"{info.attachments} attachment(s) such as fonts or cover art can't be stored in "
            f"{CONTAINER_LABELS[container]} and will be left out."
        )
    if info.data_streams:
        warnings.append(f"{info.data_streams} data stream(s) (for example timecode tracks) will be left out.")
    if info.chapters:
        if opts.keep_chapters:
            keeps.append(f"{info.chapters} chapter markers")
        else:
            warnings.append("Chapter markers will be removed, as selected.")
    if opts.keep_metadata:
        keeps.append("Title and language information")
    else:
        warnings.append("Title, language and other metadata will be removed, as selected.")

    if container != info.container:
        changes.insert(
            0,
            f"Change container from {info.container_label} to {CONTAINER_LABELS[container]}",
        )

    # --- 8. Strategy, summary, estimate ------------------------------------
    audio_encoded = [a for a in actions if a.kind == "audio" and a.action == "encode"]
    if custom:
        strategy: Strategy = "custom"
    elif video_encode is not None:
        strategy = "full"
    elif audio_encoded:
        strategy = "audio_fix"
    else:
        strategy = "remux"

    estimated, note = _estimate_size(info, actions, video_encode)
    plan = ConversionPlan(
        strategy=strategy,
        strategy_label=STRATEGY_LABELS[strategy],
        needed=True,
        container=container,
        extension=f".{container}",
        actions=actions,
        video_encode=video_encode,
        keep_metadata=opts.keep_metadata,
        keep_chapters=opts.keep_chapters,
        copy_attachments=copy_attachments,
        external_srt_index=external_srt,
        summary="",
        keeps=keeps,
        changes=changes,
        warnings=_dedupe(warnings),
        errors=_dedupe(errors),
        estimated_size=estimated,
        estimate_note=note,
    )
    plan.summary = _summary(plan, info, profile, video, video_reason)
    return plan


# --- helpers ----------------------------------------------------------------


def _dedupe(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))


def _resolution_bounds(profile: DeviceProfile, opts: ConversionOptions) -> tuple[int, int]:
    h, w = profile.max_height, profile.max_width
    if opts.max_height:
        h = min(h, opts.max_height)
        w = min(w, round(opts.max_height * 16 / 9))
    return h, w


def _fps_cap(profile: DeviceProfile, opts: ConversionOptions) -> float:
    cap = profile.max_fps
    if opts.frame_rate != "keep":
        cap = min(cap, float(opts.frame_rate))
    return cap


def _select_audio(
    info: MediaInfo, opts: ConversionOptions, errors: list[str]
) -> tuple[list[AudioStream], list[AudioStream]]:
    if not info.audio:
        return [], []
    if opts.audio_tracks == "all":
        return list(info.audio), []
    if opts.audio_tracks == "selected":
        chosen = info.audio_stream(opts.audio_stream)
        if chosen is None:
            errors.append("The selected audio track doesn't exist in this file.")
            return [], []
    else:
        chosen = info.audio_stream(info.primary_audio) or info.audio[0]
    return [chosen], [a for a in info.audio if a.index != chosen.index]


def _target_audio_codec(
    profile: DeviceProfile, opts: ConversionOptions, encoders: set[str], warnings: list[str]
) -> str:
    codec = opts.audio_codec if opts.audio_codec not in ("auto", "copy") else profile.preferred_audio_codec
    if AUDIO_ENCODERS[codec] not in encoders:
        warnings.append(f"This FFmpeg build has no {codec_label(codec)} encoder, so AAC is used instead.")
        codec = "aac"
    return codec


def _audio_copy_decision(
    a: AudioStream, profile: DeviceProfile, opts: ConversionOptions, target: str
) -> tuple[bool, str]:
    if opts.mode == "remux":
        return True, ""
    if opts.mode == "custom" and opts.audio_codec == "copy":
        return True, ""
    channels_forced = (opts.audio_channels == "stereo" and (a.channels or 2) > 2) or (
        opts.audio_channels == "5.1" and (a.channels or 2) > 6
    )
    if opts.mode == "custom" and opts.audio_codec not in ("auto", "copy"):
        if a.codec == target and not channels_forced:
            return True, ""
        return False, f"Custom settings convert audio to {codec_label(target)}."
    check = check_audio(a, profile)
    if check.support == "ok" and not channels_forced:
        return True, ""
    if channels_forced:
        return False, "A different channel layout was selected."
    if check.support == "uncertain":
        return False, (
            " ".join(check.reasons)
            + " It is converted to be safe; keep the original audio in the advanced settings "
            "if you know your TV plays it."
        )
    return False, " ".join(check.reasons)


def _target_channels(
    a: AudioStream, profile: DeviceProfile, opts: ConversionOptions, codec: str
) -> tuple[int, str | None]:
    source = a.channels or 2
    if opts.audio_channels == "stereo":
        target = 2
    elif opts.audio_channels == "5.1":
        target = min(source, 6)
    else:
        target = min(source, profile.max_audio_channels)
    reason = None
    if target < source:
        reason = (
            "you selected that layout"
            if opts.audio_channels != "auto"
            else f"the {profile.name} profile allows at most {profile.max_audio_channels} channels"
        )
    encoder_max = AUDIO_ENCODER_MAX_CHANNELS[codec]
    if target > encoder_max:
        target = encoder_max
        reason = f"the {codec_label(codec)} encoder supports at most {encoder_max} channels"
    if target < source and reason:
        return target, (
            f"{_audio_label(a)} will be downmixed from {_channels_text(source)} to "
            f"{_channels_text(target)} because {reason}."
        )
    return target, None


def _audio_bitrate(codec: str, channels: int, opts: ConversionOptions) -> int:
    low, high = AUDIO_BITRATE_LIMITS_KBPS[codec]
    if opts.audio_bitrate_kbps:
        return max(low, min(high, opts.audio_bitrate_kbps))
    return default_audio_bitrate_kbps(codec, channels)


def _choose_container(
    info: MediaInfo,
    profile: DeviceProfile,
    opts: ConversionOptions,
    copied_video: str | None,
    copied_audio: list[str],
) -> Literal["mp4", "mkv"]:
    if opts.container != "auto":
        return opts.container

    def fits(c: str) -> bool:
        return (copied_video is None or can_store(c, "video", copied_video)) and all(
            can_store(c, "audio", codec) for codec in copied_audio
        )

    source = "mp4" if info.container in ("mov", "m4v") else info.container
    candidates: list[str] = []
    if opts.mode != "remux" and source in OUTPUT_CONTAINERS and source in profile.containers:
        candidates.append(source)
    candidates.append(profile.preferred_container)
    candidates += [c for c in OUTPUT_CONTAINERS if c in profile.containers]
    if opts.mode == "remux":
        candidates = [c for c in candidates if c != info.container] + [
            c for c in OUTPUT_CONTAINERS if c != info.container
        ]
    for c in candidates:
        if c in OUTPUT_CONTAINERS and fits(c):
            return c  # type: ignore[return-value]
    first = next((c for c in candidates if c in OUTPUT_CONTAINERS), "mkv")
    return first  # type: ignore[return-value]


def _video_encode(
    video: VideoStream,
    profile: DeviceProfile,
    opts: ConversionOptions,
    encoders: set[str],
    hardware_encoders: set[str],
    max_w: int,
    max_h: int,
    fps_cap: float,
    errors: list[str],
    warnings: list[str],
) -> VideoEncode | None:
    codec = opts.video_codec if opts.video_codec in ("h264", "hevc") else profile.preferred_video_codec
    family = VIDEO_ENCODERS[codec]
    encoder, hardware = family["software"], False
    if opts.hardware_acceleration:
        hw = next((family[k] for k in HARDWARE_ORDER if family[k] in hardware_encoders), None)
        if hw:
            encoder, hardware = hw, True
        else:
            warnings.append(
                "No working hardware encoder was found for this codec, so software encoding is used."
            )
    if encoder not in encoders:
        errors.append(
            f"This FFmpeg build doesn't include the {encoder} encoder needed for "
            f"{codec_label(codec)}. Install a full FFmpeg build."
        )
        return None

    enc = VideoEncode(codec=codec, encoder=encoder, hardware=hardware)
    if encoder.endswith("_videotoolbox"):
        enc.quality = VT_QUALITY[opts.quality]
    else:
        enc.crf = opts.crf if (opts.mode == "custom" and opts.crf) else CRF_TABLE[codec][opts.quality]
    if not hardware:
        enc.preset = opts.encoder_preset

    if video.width and video.height and (video.width > max_w or video.height > max_h):
        enc.scale = (max_w, max_h)
    if video.fps and video.fps > fps_cap + 0.01:
        enc.fps = fps_cap
    elif opts.frame_rate != "keep" and (not video.fps or abs(video.fps - float(opts.frame_rate)) > 0.01):
        enc.fps = float(opts.frame_rate)

    ten_bit = codec == "hevc" and video.bit_depth > 8 and profile.max_bit_depth.get("hevc", 8) >= 10
    if ten_bit:
        enc.pix_fmt = "p010le" if hardware else "yuv420p10le"
    if video.hdr and not ten_bit:
        warnings.append(
            f"The source is {video.hdr} HDR. Converting to 8-bit {codec_label(codec)} without tone "
            "mapping can make colours look washed out. If your TV supports HDR, keep the original "
            "video or use HEVC with a profile that allows 10-bit."
        )
    if video.dolby_vision:
        warnings.append("Dolby Vision metadata is not preserved when the video is re-encoded.")
    return enc


def _plan_subtitles(
    info: MediaInfo,
    profile: DeviceProfile,
    opts: ConversionOptions,
    container: str,
    actions: list[StreamAction],
    keeps: list[str],
    changes: list[str],
    warnings: list[str],
) -> int | None:
    subs = info.subtitles
    if not subs:
        if opts.external_srt:
            warnings.append("There are no embedded subtitles to save as an .srt file.")
        return None
    pref = profile.subtitle_preference if opts.subtitles == "auto" else opts.subtitles

    if pref == "none":
        chosen: list[SubtitleStream] = []
    elif pref == "selected":
        chosen = [s for s in subs if s.index == opts.subtitle_stream]
        if not chosen:
            warnings.append("The selected subtitle track doesn't exist; no subtitles will be kept.")
    elif pref == "first_only":
        first = next((s for s in subs if s.default or s.forced), None) or next(
            (s for s in subs if s.kind == "text"), subs[0]
        )
        chosen = [first]
    else:
        chosen = list(subs)

    chosen_ids = {s.index for s in chosen}
    not_selected = [s for s in subs if s.index not in chosen_ids]
    uncertain_formats: set[str] = set()
    for s in subs:
        label = f"{s.codec_label}{_lang(s)}"
        if s.index not in chosen_ids:
            actions.append(
                StreamAction(
                    kind="subtitle",
                    source_index=s.index,
                    action="drop",
                    source_label=label,
                    language=s.language,
                    reason="Not selected.",
                )
            )
            continue
        target: str | None
        if s.kind == "text":
            if container == "mp4":
                target = "mov_text"
            else:
                target = "subrip" if s.codec == "mov_text" else s.codec
        elif s.kind == "bitmap" and container == "mkv":
            target = s.codec
        else:
            target = None
        if target is None:
            reason = (
                f"{s.codec_label} subtitles are images and can't be stored in MP4. Choose MKV to keep "
                "them; burning subtitles into the picture isn't supported."
                if s.kind == "bitmap"
                else f"{s.codec_label} subtitles can't be carried into the converted file."
            )
            warnings.append(f"Subtitle track {label} will be left out: {reason}")
            actions.append(
                StreamAction(
                    kind="subtitle",
                    source_index=s.index,
                    action="drop",
                    source_label=label,
                    language=s.language,
                    reason=reason,
                )
            )
            continue
        action = "copy" if target == s.codec else "encode"
        if s.codec in ("ass", "ssa") and target != s.codec:
            warnings.append(
                f"Styling in the {label} subtitles (fonts, colours, positions) will be lost when "
                "converted to plain timed text."
            )
        if target not in profile.subtitle_codecs:
            uncertain_formats.add(codec_label(target))
        actions.append(
            StreamAction(
                kind="subtitle",
                source_index=s.index,
                action=action,
                source_label=label,
                target_codec=target,
                target_label=codec_label(target),
                language=s.language,
                reason="Kept." if action == "copy" else "Converted to a format the container supports.",
            )
        )
        if action == "copy":
            keeps.append(f"{label} subtitles")
        else:
            changes.append(f"Convert {label} subtitles to {codec_label(target)}")

    if not_selected and pref != "none":
        warnings.append(f"{len(not_selected)} subtitle track(s) that weren't selected will be left out.")
    elif not_selected:
        warnings.append(f"All {len(not_selected)} subtitle track(s) will be left out, as selected.")
    if uncertain_formats:
        warnings.append(
            "Embedded subtitles ("
            + ", ".join(sorted(uncertain_formats))
            + f") may not be displayed by {profile.name}. An external .srt file is usually more reliable."
        )

    if not opts.external_srt:
        return None
    kept_text = [s for s in subs if s.kind == "text" and s.index in chosen_ids] or [
        s for s in subs if s.kind == "text"
    ]
    if not kept_text:
        warnings.append("Only text subtitles can be saved as an .srt file; this movie has none.")
        return None
    pick = next((s for s in kept_text if s.default or s.forced), kept_text[0])
    changes.append(f"Save {pick.codec_label}{_lang(pick)} subtitles as a separate .srt file")
    return pick.index


def _estimate_size(
    info: MediaInfo, actions: list[StreamAction], video_encode: VideoEncode | None
) -> tuple[int | None, str]:
    if video_encode is not None:
        return None, (
            "The output size can't be reliably predicted: quality-based video encoding "
            "uses as much data as each scene needs."
        )
    if not info.duration:
        return None, "The movie's duration is unknown, so the output size can't be estimated."
    duration = info.duration

    def stream_bytes(bitrate: int | None) -> float | None:
        return bitrate * duration / 8 if bitrate else None

    # Size of all source audio, needed to back out the video size if the
    # video stream doesn't report its own bitrate.
    source_audio = [stream_bytes(a.bitrate) for a in info.audio]
    video = info.video_stream(info.primary_video)
    video_bytes = stream_bytes(video.bitrate) if video else 0.0
    if video_bytes is None:
        if any(b is None for b in source_audio):
            return None, (
                "This file doesn't report per-stream bitrates, so the output size can't be "
                "reliably predicted. Expect a size close to the original."
            )
        video_bytes = max(info.size - sum(b for b in source_audio if b), 0)

    total = video_bytes
    for a in actions:
        if a.kind != "audio" or a.action == "drop":
            continue
        if a.action == "encode":
            total += (a.bitrate_kbps or 0) * 1000 * duration / 8
        else:
            src = info.audio_stream(a.source_index)
            b = stream_bytes(src.bitrate if src else None)
            if b is None:
                return None, "Some audio tracks don't report a bitrate, so the size can't be predicted."
            total += b
    total *= 1.01  # container overhead
    return int(total), "Estimated from the streams' reported bitrates; the real size may differ slightly."


def _no_conversion_plan(info: MediaInfo, profile: DeviceProfile, warnings: list[str]) -> ConversionPlan:
    actions: list[StreamAction] = []
    video = info.video_stream(info.primary_video)
    if video:
        actions.append(
            StreamAction(
                kind="video",
                source_index=video.index,
                action="copy",
                source_label=video.codec_label,
                target_codec=video.codec,
                target_label=video.codec_label,
                reason="Already compatible.",
            )
        )
    for a in info.audio:
        actions.append(
            StreamAction(
                kind="audio",
                source_index=a.index,
                action="copy",
                source_label=_audio_label(a),
                target_codec=a.codec,
                target_label=a.codec_label,
                channels=a.channels,
                language=a.language,
                reason="Already compatible.",
            )
        )
    container = "mkv" if info.container == "mkv" else "mp4"
    return ConversionPlan(
        strategy="none",
        strategy_label=STRATEGY_LABELS["none"],
        needed=False,
        container=container,  # type: ignore[arg-type]
        extension=f".{container}",
        actions=actions,
        summary=(
            f"This movie looks likely to play on {profile.name} as it is, so no conversion is "
            "needed. Copy the original file to your USB drive and test it on your TV. If it "
            "doesn't play, try the Universal profile or a full conversion."
        ),
        keeps=["Everything: the original file is already a good match"],
        warnings=_dedupe(
            warnings
            + ([] if info.audio else ["This file has no audio track, so the movie will play silently."])
        ),
        estimated_size=info.size,
        estimate_note="No conversion needed.",
    )


def _summary(
    plan: ConversionPlan,
    info: MediaInfo,
    profile: DeviceProfile,
    video: VideoStream | None,
    video_reason: str,
) -> str:
    target = CONTAINER_LABELS[plan.container]
    encoded_audio = [a for a in plan.actions if a.kind == "audio" and a.action == "encode"]
    if plan.strategy == "audio_fix":
        sources = sorted({a.source_label.split(" (")[0] for a in encoded_audio})
        targets = sorted({a.target_label or "" for a in encoded_audio})
        return (
            f"Your TV may not support the movie's {', '.join(sources)} audio. ReelForge will keep "
            f"the original video stream and convert the audio to {', '.join(targets)}. This should "
            "preserve video quality and improve playback compatibility."
        )
    if plan.strategy == "remux":
        why = (
            f"the {info.container_label} container may not be supported by {profile.name}"
            if check_container(info.container, profile).support != "ok"
            else "a different container was requested"
        )
        return (
            f"The video and audio streams look compatible, but {why}. ReelForge will repackage the "
            f"streams into {target} without re-encoding them, so quality is unchanged."
        )
    if plan.strategy == "full":
        reason = video_reason.rstrip(".") + ". " if video_reason else ""
        enc = plan.video_encode
        audio_part = " and convert the audio" if encoded_audio else ", keeping the audio as it is"
        codec = codec_label(enc.codec) if enc else "a compatible format"
        return (
            f"{reason}ReelForge will re-encode the video to {codec}{audio_part}, saved as {target}. "
            "This takes longer and slightly reduces quality, "
            "but gives the best chance of playback."
        )
    video_part = (
        ("re-encode the video" if plan.video_encode else "keep the original video stream")
        if video
        else "process the audio"
    )
    audio_part = (
        f"convert {len(encoded_audio)} audio track(s)" if encoded_audio else "keep the audio as it is"
    )
    return (
        f"ReelForge will use your custom settings: {video_part}, {audio_part}, "
        f"and save the result as {target}."
    )
