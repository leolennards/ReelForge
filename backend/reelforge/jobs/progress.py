"""Parsing FFmpeg's machine-readable ``-progress`` output."""

from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class ProgressState:
    duration: float | None
    out_time: float = 0.0
    speed: float | None = None
    finished: bool = False
    started_at: float = field(default_factory=time.monotonic)
    last_change_at: float = field(default_factory=time.monotonic)
    _block: dict[str, str] = field(default_factory=dict)
    _last_size: str | None = None

    def feed(self, line: str) -> bool:
        """Consume one ``key=value`` line. Returns True when a block completed."""
        line = line.strip()
        if "=" not in line:
            return False
        key, value = line.split("=", 1)
        self._block[key] = value
        if key != "progress":
            return False
        self._apply(self._block)
        self._block = {}
        if value == "end":
            self.finished = True
        return True

    def _apply(self, block: dict[str, str]) -> None:
        raw = block.get("out_time_us") or block.get("out_time_ms")
        if raw and raw not in ("N/A", ""):
            try:
                seconds = int(raw) / 1_000_000
            except ValueError:
                seconds = None
            if seconds is not None and seconds >= 0 and seconds != self.out_time:
                self.out_time = seconds
                self.last_change_at = time.monotonic()
        # "total_size" also grows while muxing headers, so it counts as activity.
        if block.get("total_size") not in (None, "N/A") and block.get("total_size") != self._last_size:
            self._last_size = block.get("total_size")
            self.last_change_at = time.monotonic()
        speed = block.get("speed", "").rstrip("x").strip()
        try:
            self.speed = float(speed) if speed and speed != "N/A" else self.speed
        except ValueError:
            pass

    @property
    def percent(self) -> float | None:
        """Real progress, or None when the duration is unknown."""
        if self.finished:
            return 100.0
        if not self.duration or self.duration <= 0:
            return None
        return max(0.0, min(99.9, self.out_time / self.duration * 100))

    @property
    def eta_seconds(self) -> float | None:
        """Remaining time from observed throughput; None until it is meaningful."""
        if not self.duration or self.out_time <= 0:
            return None
        elapsed = time.monotonic() - self.started_at
        if elapsed < 5:
            return None
        rate = self.out_time / elapsed  # media seconds per wall second
        if rate <= 0:
            return None
        return max(0.0, (self.duration - self.out_time) / rate)
