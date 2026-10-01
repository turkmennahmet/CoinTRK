"""Async client for the public Binance USDⓈ-M Futures REST API."""

from __future__ import annotations

from typing import Literal

import httpx

from app.clients.base import JsonClient
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

LongShortKind = Literal["accounts", "top_positions"]
_LONG_SHORT_PATHS: dict[LongShortKind, str] = {
    "accounts": "/futures/data/globalLongShortAccountRatio",
    "top_positions": "/futures/data/topLongShortPositionRatio",
}


class BinanceClient(JsonClient):
    """Thin, typed wrapper around the futures endpoints this app needs."""

    def __init__(self, http: httpx.AsyncClient, settings: Settings) -> None:
        super().__init__(http, settings, settings.max_concurrency)

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
