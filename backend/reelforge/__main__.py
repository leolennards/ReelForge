"""Start the local API: ``python -m reelforge``."""

from __future__ import annotations

import sys

import uvicorn

from .config import load_settings
from .main import create_app
from .security import is_loopback


def main() -> None:
    settings = load_settings()
    if not is_loopback(settings.host) and not settings.allow_remote:
        sys.exit(
            f"Refusing to listen on {settings.host}: ReelForge only binds to this computer "
            "(127.0.0.1) by default. Set REELFORGE_ALLOW_REMOTE=1 only if you understand that "
            "anyone on your network could then reach it."
        )
    extra = None if is_loopback(settings.host) else {settings.host}
    uvicorn.run(
        create_app(settings, extra_hosts=extra),
        host=settings.host,
        port=settings.port,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    main()
