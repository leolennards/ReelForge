"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import config_routes, jobs, media
from .config import APP_NAME, APP_VERSION, Settings, load_settings
from .db import Database
from .jobs.manager import DuplicateJobError, JobError
from .logging_setup import setup_logging
from .media.ffmpeg_tools import FFmpegStatus, detect_ffmpeg
from .paths import PathNotAllowed
from .security import LocalOnlyMiddleware
from .state import AppState, ProfileError

log = logging.getLogger("reelforge")


def create_app(
    settings: Settings | None = None,
    ffmpeg_status: FFmpegStatus | None = None,
    extra_hosts: set[str] | None = None,
) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        setup_logging(settings.log_dir)
        db = Database(settings.db_path)
        status = ffmpeg_status or await asyncio.to_thread(detect_ffmpeg, settings)
        if not status.available:
            log.warning("ffmpeg unavailable", extra={"error": status.error})
        state = AppState(settings=settings, db=db, ffmpeg=status)
        state.apply_retention()
        app.state.reelforge = state
        await state.jobs.start()
        log.info("started", extra={"version": APP_VERSION, "port": settings.port})
        try:
            yield
        finally:
            await state.jobs.stop()
            db.close()

    app = FastAPI(
        title=f"{APP_NAME} local API",
        version=APP_VERSION,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    app.add_middleware(LocalOnlyMiddleware, allowed_origins=settings.allowed_origins, extra_hosts=extra_hosts)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "X-ReelForge-Client", "X-Filename"],
        allow_credentials=False,
        max_age=600,
    )

    @app.exception_handler(PathNotAllowed)
    async def _path(_: Request, exc: PathNotAllowed) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=403)

    @app.exception_handler(ProfileError)
    async def _profile(_: Request, exc: ProfileError) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=400)

    @app.exception_handler(DuplicateJobError)
    async def _dup(_: Request, exc: DuplicateJobError) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(JobError)
    async def _job(_: Request, exc: JobError) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=400)

    app.include_router(config_routes.router)
    app.include_router(media.router)
    app.include_router(jobs.router)
    return app
