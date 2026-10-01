"""Candles kept between scans, so a refresh only downloads what is new.

Closed candles never change, yet a full scan downloads a few MB of them. With
the previous candles in memory a refresh asks Binance for the handful of
candles since the last one we have (weight 1, well under 1 KB per symbol).
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Protocol

from app.clients.models import Kline

INTERVAL_MS: dict[str, int] = {
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
    "1w": 7 * 24 * 60 * 60_000,
}
# Binance charges weight 1 for limit < 100; beyond that a full download is as cheap.
MAX_INCREMENTAL_LIMIT = 99


class KlineSource(Protocol):
    """Anything that serves Binance-style candles: the futures and the Alpha client."""

    async def klines(self, symbol: str, interval: str, limit: int) -> list[Kline]: ...


class KlineStore:
    def __init__(self) -> None:
        self._data: dict[tuple[str, str], list[Kline]] = {}

    async def fetch(
        self, client: KlineSource, symbol: str, interval: str, limit: int, now_ms: int
    ) -> list[Kline]:
        """The latest ``limit`` candles, including the one still forming."""
        key = (symbol, interval)
        have = self._data.get(key)
        candles = await self._update(client, symbol, interval, limit, now_ms, have) if have else None
        if candles is None:
            candles = await client.klines(symbol, interval, limit)
        self._data[key] = candles
        return candles

    async def _update(
        self, client: KlineSource, symbol: str, interval: str, limit: int, now_ms: int, have: list[Kline]
    ) -> list[Kline] | None:
        # From our last candle (it may have been still forming) up to the current one, plus one of overlap.
        missing = (now_ms - have[-1].open_time) // INTERVAL_MS[interval] + 2
        if len(have) < limit or missing > MAX_INCREMENTAL_LIMIT:
            return None
        new = await client.klines(symbol, interval, missing)
        if not new or new[0].open_time > have[-1].open_time:
            return None  # would leave a gap, e.g. after clock skew
        first_new = new[0].open_time
        return [*(k for k in have if k.open_time < first_new), *new][-limit:]

    def retain(self, interval: str, symbols: Iterable[str]) -> None:
        """Forget symbols that dropped out of the scanned universe."""
        keep = set(symbols)
        for key in [k for k in self._data if k[1] == interval and k[0] not in keep]:
            del self._data[key]

    def clear(self) -> None:
        self._data.clear()
