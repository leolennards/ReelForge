"""Checks run on a finished file before it is reported as complete.

This confirms the file exists, can be inspected, and contains the streams the
plan asked for. It is not a substitute for playing the file on the real TV.
"""

from __future__ import annotations

from pydantic import BaseModel

from ..media.codecs import codec_label
from ..media.models import MediaInfo
from ..planning.planner import ConversionPlan


class ValidationCheck(BaseModel):
    name: str
    ok: bool
    detail: str


class ValidationResult(BaseModel):
    ok: bool
    checks: list[ValidationCheck]


def duration_tolerance(seconds: float) -> float:
    return max(2.0, seconds * 0.01)


def validate_output(source: MediaInfo, output: MediaInfo, plan: ConversionPlan) -> ValidationResult:
    checks: list[ValidationCheck] = []

    checks.append(
        ValidationCheck(
            name="File readable",
            ok=output.size > 0,
            detail=f"The converted file can be inspected ({output.container_label}).",
        )
    )

    expected_container = "mkv" if plan.container == "mkv" else "mp4"
    checks.append(
        ValidationCheck(
            name="Container",
            ok=output.container == expected_container,
            detail=f"Expected {expected_container.upper()}, found {output.container_label}.",
        )
    )

    for kind, found in (("video", output.video), ("audio", output.audio)):
        expected = plan.kept(kind)
        ok = len(found) == len(expected)
        detail = f"Expected {len(expected)} {kind} stream(s), found {len(found)}."
        if ok:
            mismatched = [
                (e.target_codec, f.codec)
                for e, f in zip(expected, found, strict=True)
                if e.target_codec and e.target_codec != f.codec
            ]
            if mismatched:
                ok = False
                want, got = mismatched[0]
                detail = f"Expected {codec_label(want)} {kind}, found {codec_label(got)}."
            else:
                codecs = ", ".join(sorted({codec_label(f.codec) for f in found})) or "none"
                detail = f"{len(found)} {kind} stream(s): {codecs}."
        checks.append(ValidationCheck(name=f"{kind.title()} streams", ok=ok, detail=detail))

    expected_subs = len(plan.kept("subtitle"))
    checks.append(
        ValidationCheck(
            name="Subtitle streams",
            ok=len(output.subtitles) == expected_subs,
            detail=f"Expected {expected_subs} subtitle stream(s), found {len(output.subtitles)}.",
        )
    )

    if source.duration and output.duration:
        diff = abs(source.duration - output.duration)
        checks.append(
            ValidationCheck(
                name="Duration",
                ok=diff <= duration_tolerance(source.duration),
                detail=f"Source {source.duration:.1f}s, output {output.duration:.1f}s.",
            )
        )
    else:
        checks.append(
            ValidationCheck(
                name="Duration",
                ok=output.duration is not None and output.duration > 0,
                detail="The source duration is unknown, so only a non-zero output duration was checked.",
            )
        )
    return ValidationResult(ok=all(c.ok for c in checks), checks=checks)
