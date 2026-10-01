"""Async client for the public Binance USDⓈ-M Futures REST API."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

import httpx

from app.clients.models import (
    FundingInfo,
    Kline,
    LongShortRatio,
    OpenInterestPoint,
    PremiumIndex,
    SymbolInfo,
    Ticker24h,
)
from app.config import Settings
from app.core.errors import UpstreamError, UpstreamRateLimitedError, UpstreamRegionBlockedError

logger = logging.getLogger(__name__)

LongShortKind = Literal["accounts", "top_positions"]
_LONG_SHORT_PATHS: dict[LongShortKind, str] = {
    "accounts": "/futures/data/globalLongShortAccountRatio",
    "top_positions": "/futures/data/topLongShortPositionRatio",
}

_RETRYABLE_STATUS = frozenset({500, 502, 503, 504})
_MAX_BACKOFF_S = 4.0


class BinanceClient:
    """Thin, typed wrapper around the endpoints this app needs.

    One instance is created per request (see ``app.dependencies``) because an
    ``httpx.AsyncClient`` is bound to the event loop it was created on, and
    serverless runtimes do not guarantee the same loop across invocations.
    """

    def __init__(self, http: httpx.AsyncClient, settings: Settings) -> None:
        self._http = http
        self._settings = settings
        self._semaphore = asyncio.Semaphore(settings.max_concurrency)

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        attempts = self._settings.http_max_retries + 1
        for attempt in range(attempts):
            is_last = attempt == attempts - 1
            async with self._semaphore:
                try:
                    response = await self._http.get(path, params=params)
                except httpx.TransportError as exc:
                    if is_last:
                        raise UpstreamError(f"Binance'e ulaşılamadı: {exc.__class__.__name__}") from exc
                    await asyncio.sleep(self._backoff(attempt))
                    continue

            status = response.status_code
            if status == 200:
                return response.json()
            if status in (403, 451):
                raise UpstreamRegionBlockedError(
                    "Binance bu sunucu bölgesinden gelen istekleri engelliyor. "
                    "Vercel fonksiyon bölgesini fra1 gibi desteklenen bir bölgeye alın."
                )
            if status in (418, 429):
                retry_after = _parse_retry_after(response)
                if is_last or retry_after > _MAX_BACKOFF_S:
                    raise UpstreamRateLimitedError(
                        "Binance istek limiti aşıldı, lütfen biraz sonra tekrar deneyin."
                    )
                await asyncio.sleep(retry_after or self._backoff(attempt))
                continue
            if status in _RETRYABLE_STATUS and not is_last:
                await asyncio.sleep(self._backoff(attempt))
                continue

            logger.warning("Binance %s returned %s: %s", path, status, response.text[:200])
            raise UpstreamError(f"Binance beklenmeyen yanıt döndü (HTTP {status}).")

        raise UpstreamError("Binance isteği başarısız oldu.")  # pragma: no cover

    @staticmethod
    def _backoff(attempt: int) -> float:
        return float(min(0.25 * 2**attempt, _MAX_BACKOFF_S))

    async def exchange_info(self) -> list[SymbolInfo]:
        data = await self._get("/fapi/v1/exchangeInfo")
        return [SymbolInfo.from_api(item) for item in data["symbols"]]

    async def tickers_24h(self) -> list[Ticker24h]:
        data = await self._get("/fapi/v1/ticker/24hr")
        return [Ticker24h.from_api(item) for item in data]

    async def premium_index(self) -> list[PremiumIndex]:
        data = await self._get("/fapi/v1/premiumIndex")
        return [PremiumIndex.from_api(item) for item in data]

    async def funding_info(self) -> list[FundingInfo]:
        """Only symbols with a non-default funding interval/cap are listed."""
        data = await self._get("/fapi/v1/fundingInfo")
        return [FundingInfo.from_api(item) for item in data]

    async def klines(self, symbol: str, interval: str, limit: int) -> list[Kline]:
        data = await self._get("/fapi/v1/klines", {"symbol": symbol, "interval": interval, "limit": limit})
        return [Kline.from_api(item) for item in data]

    async def open_interest_hist(self, symbol: str, period: str, limit: int) -> list[OpenInterestPoint]:
        data = await self._get(
            "/futures/data/openInterestHist",
            {"symbol": symbol, "period": period, "limit": limit},
        )
        return [OpenInterestPoint.from_api(item) for item in data]

    async def long_short_ratio(
        self, kind: LongShortKind, symbol: str, period: str, limit: int
    ) -> list[LongShortRatio]:
        """Long/short split of all accounts, or of the top traders' positions."""
        data = await self._get(_LONG_SHORT_PATHS[kind], {"symbol": symbol, "period": period, "limit": limit})
        return [LongShortRatio.from_api(item) for item in data]


def _parse_retry_after(response: httpx.Response) -> float:
    try:
        return float(response.headers.get("Retry-After", "0"))
    except ValueError:
        return 0.0
