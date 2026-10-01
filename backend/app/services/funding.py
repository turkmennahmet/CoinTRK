"""Funding rates for every USDT perpetual. Needs only three bulk requests."""

from __future__ import annotations

import asyncio
import time

from app.clients.binance import BinanceClient
from app.clients.models import PremiumIndex, SymbolInfo, Ticker24h
from app.core.cache import TTLCache
from app.schemas.common import ResponseMeta
from app.schemas.funding import FundingResponse, FundingRow
from app.services.market import MarketData

FUNDING_TTL_S = 30.0
FUNDING_INFO_TTL_S = 3600.0
DEFAULT_INTERVAL_HOURS = 8
HOURS_PER_YEAR = 24 * 365


def annualize(rate_pct: float, interval_hours: int) -> float:
    return rate_pct * (HOURS_PER_YEAR / interval_hours)


def build_funding_row(
    info: SymbolInfo, premium: PremiumIndex, ticker: Ticker24h, interval_hours: int
) -> FundingRow:
    rate_pct = premium.funding_rate * 100.0
    return FundingRow(
        symbol=info.symbol,
        base_asset=info.base_asset,
        mark_price=premium.mark_price,
        funding_rate_pct=round(rate_pct, 6),
        interval_hours=interval_hours,
        apr_pct=round(annualize(rate_pct, interval_hours), 2),
        next_funding_time=premium.next_funding_time,
        change_24h_pct=ticker.price_change_pct,
        quote_volume_24h=ticker.quote_volume,
    )


class FundingService:
    def __init__(self, client: BinanceClient, market: MarketData, cache: TTLCache[object]) -> None:
        self._client = client
        self._market = market
        self._cache = cache

    async def rates(self) -> FundingResponse:
        return await self._cache.get_or_load("funding", FUNDING_TTL_S, self._load)  # type: ignore[return-value]

    async def _intervals(self) -> dict[str, int]:
        async def load() -> dict[str, int]:
            return {f.symbol: f.interval_hours for f in await self._client.funding_info()}

        return await self._cache.get_or_load("funding_info", FUNDING_INFO_TTL_S, load)  # type: ignore[return-value]

    async def _load(self) -> FundingResponse:
        symbols, tickers, premiums, intervals = await asyncio.gather(
            self._market.usdt_perpetuals(),
            self._market.tickers(),
            self._client.premium_index(),
            self._intervals(),
        )
        rows = [
            build_funding_row(
                symbols[p.symbol],
                p,
                tickers[p.symbol],
                intervals.get(p.symbol, DEFAULT_INTERVAL_HOURS),
            )
            for p in premiums
            if p.symbol in symbols and p.symbol in tickers
        ]
        rows.sort(key=lambda r: r.quote_volume_24h, reverse=True)
        return FundingResponse(
            meta=ResponseMeta(generated_at=int(time.time() * 1000), universe_size=len(rows)),
            rows=rows,
        )
