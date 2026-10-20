"""Path safety: every filesystem path the API touches goes through here.

The backend only ever reads movies from the configured media folders (or its
own upload folder) and only writes into the configured output roots. Paths
are fully resolved (following symlinks) before they are compared, so ``..``
segments and links cannot escape those folders.
"""

from __future__ import annotations

import os
import re
import shutil
import unicodedata
from pathlib import Path

WINDOWS_RESERVED = {
    "con",
    "prn",
    "aux",
    "nul",
    *(f"com{i}" for i in range(1, 10)),
    *(f"lpt{i}" for i in range(1, 10)),
}
_UNSAFE_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f]')
MAX_NAME_LENGTH = 150


class PathNotAllowed(Exception):
    """A path falls outside the folders ReelForge may use."""


def resolve_within(candidate: Path | str, roots: list[Path]) -> Path:
    """Resolve ``candidate`` and ensure it lies inside one of ``roots``."""
    try:
        resolved = Path(candidate).expanduser().resolve(strict=False)
    except (OSError, RuntimeError) as exc:
        raise PathNotAllowed("That location could not be resolved.") from exc
    for root in roots:
        try:
            root_resolved = root.expanduser().resolve(strict=False)
        except (OSError, RuntimeError):
            continue
        if resolved == root_resolved or resolved.is_relative_to(root_resolved):
            return resolved
    raise PathNotAllowed("That location is outside the folders ReelForge is allowed to use.")


def is_hidden(path: Path, root: Path) -> bool:
    try:
        parts = path.relative_to(root).parts
    except ValueError:
        return True
    return any(p.startswith(".") for p in parts)


def safe_filename(name: str, fallback: str = "movie") -> str:
    """Return a filename stem that is safe on macOS, Windows and Linux."""
    name = unicodedata.normalize("NFC", name or "")
    name = name.replace("\\", "/").split("/")[-1]
    name = _UNSAFE_CHARS.sub(" ", name)
    name = re.sub(r"\s+", " ", name).strip().strip(".").strip()
    if not name or name.lower() in WINDOWS_RESERVED or name.split(".")[0].lower() in WINDOWS_RESERVED:
        name = fallback
    if len(name) > MAX_NAME_LENGTH:
        name = name[:MAX_NAME_LENGTH].rstrip()
    return name


def unique_path(directory: Path, stem: str, extension: str) -> Path:
    """Pick ``stem + extension`` in ``directory``, adding " (2)", " (3)"... on collision."""
    candidate = directory / f"{stem}{extension}"
    n = 2
    while candidate.exists():
        candidate = directory / f"{stem} ({n}){extension}"
        n += 1
        if n > 9999:
            raise OSError("Could not find a free output filename.")
    return candidate


def free_space(directory: Path) -> int:
    probe = directory
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    return shutil.disk_usage(probe).free


def remove_quietly(path: Path | None) -> None:
    if path is None:
        return
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except OSError:
        pass
