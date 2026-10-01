"""FastAPI dependency wiring.

The HTTP client is scoped to a request (it is bound to an event loop); caches
are module-level so they survive across invocations on a warm instance.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends

from app.clients.alpha import AlphaClient
from app.clients.binance import BinanceClient
from app.config import Settings, get_settings
from app.core.cache import TTLCache
from app.core.revalidate import Revalidator
from app.services.alpha import AlphaScannerService
from app.services.coin import CoinService
from app.services.funding import FundingService
from app.services.klines import KlineStore
from app.services.market import MarketData
from app.services.open_interest import OpenInterestService
from app.services.scanner import ScannerService

SettingsDep = Annotated[Settings, Depends(get_settings)]


@asynccontextmanager
async def binance_session(settings: Settings) -> AsyncIterator[BinanceClient]:
    async with httpx.AsyncClient(
        base_url=settings.binance_base_url,
        timeout=settings.http_timeout_s,
        limits=httpx.Limits(
            max_connections=settings.max_concurrency,
            max_keepalive_connections=settings.max_concurrency,
        ),
        headers={"Accept": "application/json", "User-Agent": "cointrk/1.0"},
    ) as http:
        yield BinanceClient(http, settings)


@asynccontextmanager
async def alpha_session(settings: Settings) -> AsyncIterator[AlphaClient]:
    async with httpx.AsyncClient(
        base_url=settings.alpha_base_url,
        timeout=settings.http_timeout_s,
        limits=httpx.Limits(
            max_connections=settings.alpha_max_concurrency,
            max_keepalive_connections=settings.alpha_max_concurrency,
        ),
        headers={"Accept": "application/json", "User-Agent": "cointrk/1.0"},
    ) as http:
        yield AlphaClient(http, settings)


_cache: TTLCache[object] = TTLCache(max_entries=64)
_klines = KlineStore()
# Kept apart so browsing many coins cannot evict the (expensive) full scans.
_coin_cache: TTLCache[object] = TTLCache(max_entries=128)
_revalidator: Revalidator[BinanceClient] = Revalidator(_cache, lambda: binance_session(get_settings()))
# Alpha has its own cache and candles, so it can never evict the futures data.
_alpha_cache: TTLCache[object] = TTLCache(max_entries=32)
_alpha_klines = KlineStore()
_alpha_revalidator: Revalidator[AlphaClient] = Revalidator(
    _alpha_cache, lambda: alpha_session(get_settings())
)


async def get_binance_client(settings: SettingsDep) -> AsyncIterator[BinanceClient]:
    async with binance_session(settings) as client:
        yield client


ClientDep = Annotated[BinanceClient, Depends(get_binance_client)]


def get_market(client: ClientDep) -> MarketData:
    return MarketData(client, _cache)


MarketDep = Annotated[MarketData, Depends(get_market)]


def get_scanner_service(client: ClientDep, market: MarketDep, settings: SettingsDep) -> ScannerService:
    return ScannerService(client, market, _cache, _revalidator, _klines, settings.scanner_universe_size)


def get_funding_service(client: ClientDep, market: MarketDep) -> FundingService:
    return FundingService(client, market, _cache)


def get_open_interest_service(client: ClientDep, settings: SettingsDep) -> OpenInterestService:
    return OpenInterestService(client, _cache, _revalidator, settings.oi_universe_size)


def get_coin_service(client: ClientDep, market: MarketDep) -> CoinService:
    return CoinService(client, market, FundingService(client, market, _cache), _klines, _coin_cache)


async def get_alpha_client(settings: SettingsDep) -> AsyncIterator[AlphaClient]:
    async with alpha_session(settings) as client:
        yield client


AlphaClientDep = Annotated[AlphaClient, Depends(get_alpha_client)]


def get_alpha_scanner_service(client: AlphaClientDep, settings: SettingsDep) -> AlphaScannerService:
    return AlphaScannerService(
        client, _alpha_cache, _alpha_revalidator, _alpha_klines, settings.alpha_universe_size
    )
