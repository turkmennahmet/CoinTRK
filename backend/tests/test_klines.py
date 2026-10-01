import asyncio

from app.clients.models import Kline
from app.services.klines import KlineStore

from .factories import HOUR_MS, klines


class FakeClient:
    """Serves the latest ``limit`` candles of an hourly series that ends at ``now_ms``."""

    def __init__(self) -> None:
        self.now_ms = 0
        self.limits: list[int] = []

    async def klines(self, symbol: str, interval: str, limit: int) -> list[Kline]:
        self.limits.append(limit)
        count = self.now_ms // HOUR_MS + 1
        closes = [100.0 + i for i in range(count)]
        return klines(closes)[-limit:]


def test_refresh_downloads_only_new_candles():
    client, store = FakeClient(), KlineStore()

    async def fetch() -> list[Kline]:
        return await store.fetch(client, "BTCUSDT", "1h", 10, client.now_ms)  # type: ignore[arg-type]

    client.now_ms = 100 * HOUR_MS + 5
    first = asyncio.run(fetch())
    client.now_ms = 103 * HOUR_MS + 5
    second = asyncio.run(fetch())

    assert client.limits == [10, 5]
    assert [k.open_time for k in first] == [i * HOUR_MS for i in range(91, 101)]
    assert [k.open_time for k in second] == [i * HOUR_MS for i in range(94, 104)]


def test_long_gap_falls_back_to_full_download():
    client, store = FakeClient(), KlineStore()
    client.now_ms = 100 * HOUR_MS
    asyncio.run(store.fetch(client, "BTCUSDT", "1h", 10, client.now_ms))  # type: ignore[arg-type]
    client.now_ms = 300 * HOUR_MS
    candles = asyncio.run(store.fetch(client, "BTCUSDT", "1h", 10, client.now_ms))  # type: ignore[arg-type]

    assert client.limits == [10, 10]
    assert candles[-1].open_time == 300 * HOUR_MS


def test_retain_forgets_dropped_symbols():
    client, store = FakeClient(), KlineStore()
    client.now_ms = 100 * HOUR_MS
    for symbol in ("BTCUSDT", "ETHUSDT"):
        asyncio.run(store.fetch(client, symbol, "1h", 10, client.now_ms))  # type: ignore[arg-type]
    store.retain("1h", ["BTCUSDT"])
    asyncio.run(store.fetch(client, "ETHUSDT", "1h", 10, client.now_ms))  # type: ignore[arg-type]

    assert client.limits == [10, 10, 10]
