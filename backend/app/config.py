"""Application settings, read once from environment variables.

Every tunable lives here so that deploy-time behaviour can be changed from the
Vercel dashboard without touching code.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be an integer, got {raw!r}") from exc


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be a number, got {raw!r}") from exc


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True, slots=True)
class Settings:
    binance_base_url: str = field(
        default_factory=lambda: os.getenv("BINANCE_FAPI_URL", "https://fapi.binance.com")
    )
    http_timeout_s: float = field(default_factory=lambda: _env_float("HTTP_TIMEOUT_S", 10.0))
    http_max_retries: int = field(default_factory=lambda: _env_int("HTTP_MAX_RETRIES", 2))
    # Upper bound on simultaneous requests to Binance from one function invocation.
    max_concurrency: int = field(default_factory=lambda: _env_int("MAX_CONCURRENCY", 20))

    # Kline-based scans (RSI, MA cross, volume, anomaly) cover the top-N symbols by
    # 24h quote volume. Each symbol costs 2 request weight (Binance limit: 2400/min).
    scanner_universe_size: int = field(default_factory=lambda: _env_int("SCANNER_UNIVERSE_SIZE", 400))
    # openInterestHist has a separate limit of 1000 requests / 5 min per IP.
    oi_universe_size: int = field(default_factory=lambda: _env_int("OI_UNIVERSE_SIZE", 150))

    cors_origins: list[str] = field(default_factory=lambda: _env_list("CORS_ORIGINS", []))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
