"""FastAPI application factory."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.core.errors import AppError
from app.routers import alpha, health, market

API_PREFIX = "/api"

logger = logging.getLogger("app")


def create_app() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    settings = get_settings()

    app = FastAPI(
        title="CoinTRK API",
        version="1.0.0",
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json",
    )

    # Scanner payloads are ~100-200 KB of JSON; gzip shrinks them ~10x.
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET"],
            allow_headers=["*"],
        )

    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        logger.warning("%s: %s", exc.code, exc.message)
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message},
            headers={"Cache-Control": "no-store"},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"code": "internal_error", "message": "Beklenmeyen bir hata oluştu."},
            headers={"Cache-Control": "no-store"},
        )

    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(market.router, prefix=API_PREFIX)
    app.include_router(alpha.router, prefix=API_PREFIX)
    return app


app = create_app()
