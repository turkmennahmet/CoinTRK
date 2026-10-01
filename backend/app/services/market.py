"""Market universe: which symbols exist and how liquid they are."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Iterable

from app.clients.binance import BinanceClient
from app.clients.models import SymbolInfo, Ticker24h
from app.core.cache import TTLCache
from app.core.errors import AppError, UpstreamError

logger = logging.getLogger(__name__)

EXCHANGE_INFO_TTL_S = 3600.0
TICKERS_TTL_S = 15.0


class MarketData:
    def __init__(self, client: BinanceClient, cache: TTLCache[object]) -> None:
        self._client = client
        self._cache = cache

    async def usdt_perpetuals(self) -> dict[str, SymbolInfo]:
        """Actively trading USDT-margined perpetual contracts, keyed by symbol."""

        async def load() -> dict[str, SymbolInfo]:
            symbols = await self._client.exchange_info()
            return {
                s.symbol: s
                for s in symbols
                if s.contract_type == "PERPETUAL" and s.quote_asset == "USDT" and s.status == "TRADING"
            }

        return await self._cache.get_or_load("exchange_info", EXCHANGE_INFO_TTL_S, load)  # type: ignore[return-value]

    async def tickers(self) -> dict[str, Ticker24h]:
        async def load() -> dict[str, Ticker24h]:
            return {t.symbol: t for t in await self._client.tickers_24h()}

        return await self._cache.get_or_load("tickers_24h", TICKERS_TTL_S, load)  # type: ignore[return-value]

    async def most_liquid(self, limit: int) -> list[tuple[SymbolInfo, Ticker24h]]:
        """Top ``limit`` USDT perpetuals by 24h quote volume, most liquid first."""
        symbols, tickers = await asyncio.gather(self.usdt_perpetuals(), self.tickers())
        pairs = [(info, tickers[sym]) for sym, info in symbols.items() if sym in tickers]
        pairs.sort(key=lambda pair: pair[1].quote_volume, reverse=True)
        return pairs[:limit]


async def fetch_per_symbol[T](
    symbols: Iterable[str], fetch: Callable[[str], Awaitable[T]]
) -> tuple[dict[str, T], list[str]]:
    """Run ``fetch`` for every symbol concurrently and tolerate partial failure.

    Returns the successful results and the symbols that failed. If *every*
    symbol failed the first error is re-raised, since an empty table would hide
    a systemic problem such as a rate limit or a region block.
    """
    symbols = list(symbols)
    outcomes = await asyncio.gather(*(fetch(s) for s in symbols), return_exceptions=True)

    results: dict[str, T] = {}
    failed: list[str] = []
    first_error: BaseException | None = None
    for symbol, outcome in zip(symbols, outcomes, strict=True):
        if isinstance(outcome, BaseException):
            if not isinstance(outcome, AppError):
                logger.exception("Unexpected error for %s", symbol, exc_info=outcome)
            failed.append(symbol)
            first_error = first_error or outcome
        else:
            results[symbol] = outcome

    if symbols and not results and first_error is not None:
        if isinstance(first_error, AppError):
            raise first_error
        raise UpstreamError("Veri alınamadı.") from first_error
    if failed:
        logger.warning("%d/%d symbol requests failed", len(failed), len(symbols))
    return results, failed
