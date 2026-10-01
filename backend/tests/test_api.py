"""End-to-end API tests against a fake Binance served by httpx.MockTransport."""

from __future__ import annotations

import asyncio
import math
import time
from collections.abc import AsyncIterator, Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app import dependencies
from app.clients.binance import BinanceClient
from app.config import Settings
from app.main import create_app

HOUR_MS = 3_600_000
SYMBOLS = {"BTCUSDT": "BTC", "ETHUSDT": "ETH"}


def fake_binance(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path == "/fapi/v1/exchangeInfo":
        symbols = [
            {
                "symbol": s,
                "baseAsset": b,
                "quoteAsset": "USDT",
                "contractType": "PERPETUAL",
                "status": "TRADING",
            }
            for s, b in SYMBOLS.items()
        ]
        symbols.append(
            {"symbol": "OLDUSDT", "baseAsset": "OLD", "quoteAsset": "USDT",
             "contractType": "PERPETUAL", "status": "SETTLING"}
        )  # fmt: skip
        return httpx.Response(200, json={"symbols": symbols})
    if path == "/fapi/v1/ticker/24hr":
        return httpx.Response(
            200,
            json=[
                {"symbol": s, "lastPrice": "100", "priceChangePercent": "1.2", "quoteVolume": str(1e9 - i)}
                for i, s in enumerate([*SYMBOLS, "OLDUSDT"])
            ],
        )
    if path == "/fapi/v1/klines":
        limit = int(request.url.params["limit"])
        start = int(time.time() * 1000) - (limit + 1) * HOUR_MS
        rows = []
        for i in range(limit):
            close = 100 + math.sin(i / 3)
            t = start + i * HOUR_MS
            rows.append(
                [t, "100", "101", "99", str(close), "10", t + HOUR_MS - 1, "1000", 1, "5", "500", "0"]
            )
        return httpx.Response(200, json=rows)
    if path == "/fapi/v1/premiumIndex":
        return httpx.Response(
            200,
            json=[
                {"symbol": s, "markPrice": "100", "indexPrice": "100", "lastFundingRate": "0.0001",
                 "nextFundingTime": 0}
                for s in SYMBOLS
            ],
        )  # fmt: skip
    if path == "/fapi/v1/fundingInfo":
        return httpx.Response(200, json=[{"symbol": "ETHUSDT", "fundingIntervalHours": 4}])
    if path == "/futures/data/openInterestHist":
        limit = int(request.url.params["limit"])
        return httpx.Response(
            200,
            json=[
                {"symbol": request.url.params["symbol"], "sumOpenInterest": "10",
                 "sumOpenInterestValue": str(1000 + i * 10), "timestamp": i * HOUR_MS}
                for i in range(limit)
            ],
        )  # fmt: skip
    if path in ("/futures/data/globalLongShortAccountRatio", "/futures/data/topLongShortPositionRatio"):
        long_share = 0.6 if "global" in path else 0.45
        return httpx.Response(
            200,
            json=[
                {"symbol": request.url.params["symbol"], "longAccount": str(long_share),
                 "shortAccount": str(round(1 - long_share, 4)),
                 "longShortRatio": str(long_share / (1 - long_share)), "timestamp": 0}
            ],
        )  # fmt: skip
    return httpx.Response(404)


def make_client(handler: Callable[[httpx.Request], httpx.Response]) -> TestClient:
    settings = Settings(http_max_retries=1)

    async def override() -> AsyncIterator[BinanceClient]:
        async with httpx.AsyncClient(
            base_url="https://fapi.test", transport=httpx.MockTransport(handler)
        ) as http:
            yield BinanceClient(http, settings)

    app = create_app()
    app.dependency_overrides[dependencies.get_binance_client] = override
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_cache():
    dependencies._cache.clear()
    dependencies._coin_cache.clear()
    dependencies._klines.clear()
    yield
    dependencies._cache.clear()
    dependencies._coin_cache.clear()
    dependencies._klines.clear()


def test_scanner_endpoint():
    res = make_client(fake_binance).get("/api/scanner", params={"interval": "1h"})
    assert res.status_code == 200
    assert "s-maxage=15" in res.headers["cache-control"]
    body = res.json()
    assert body["interval"] == "1h"
    assert [r["symbol"] for r in body["rows"]] == ["BTCUSDT", "ETHUSDT"]
    assert body["meta"]["failed_symbols"] == []
    assert 0 <= body["rows"][0]["rsi"] <= 100


def test_scanner_rejects_unknown_interval():
    assert make_client(fake_binance).get("/api/scanner", params={"interval": "3m"}).status_code == 422


def test_funding_endpoint_uses_symbol_specific_interval():
    rows = {r["symbol"]: r for r in make_client(fake_binance).get("/api/funding").json()["rows"]}
    assert rows["BTCUSDT"]["interval_hours"] == 8
    assert rows["ETHUSDT"]["interval_hours"] == 4
    assert rows["ETHUSDT"]["apr_pct"] == pytest.approx(21.9)


def test_open_interest_endpoint():
    body = make_client(fake_binance).get("/api/open-interest", params={"period": "4h"}).json()
    assert body["period"] == "4h"
    assert len(body["rows"]) == 2
    assert [c["window"] for c in body["rows"][0]["changes"]] == ["15m", "1h", "4h", "1d", "1w"]
    assert body["rows"][0]["bias"] == "long_buildup"
    assert body["rows"][0]["accounts_ratio"] == {"long_pct": 60.0, "short_pct": 40.0, "ratio": 1.5}
    assert body["rows"][0]["top_traders_ratio"]["long_pct"] == 45.0


def test_open_interest_survives_missing_long_short_ratios():
    def no_ratios(request: httpx.Request) -> httpx.Response:
        if "LongShort" in request.url.path:
            return httpx.Response(429, headers={"Retry-After": "60"})
        return fake_binance(request)

    res = make_client(no_ratios).get("/api/open-interest", params={"period": "1h"})
    assert res.status_code == 200
    rows = res.json()["rows"]
    assert len(rows) == 2
    assert rows[0]["accounts_ratio"] is None
    assert rows[0]["top_traders_ratio"] is None


def test_partial_failures_are_reported_not_fatal():
    def flaky(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/fapi/v1/klines" and request.url.params["symbol"] == "ETHUSDT":
            return httpx.Response(400, json={"code": -1121, "msg": "Invalid symbol."})
        return fake_binance(request)

    body = make_client(flaky).get("/api/scanner").json()
    assert [r["symbol"] for r in body["rows"]] == ["BTCUSDT"]
    assert body["meta"]["failed_symbols"] == ["ETHUSDT"]


def test_region_block_returns_clear_error():
    res = make_client(lambda _: httpx.Response(451)).get("/api/funding")
    assert res.status_code == 503
    assert res.json()["code"] == "upstream_region_blocked"
    assert res.headers["cache-control"] == "no-store"


def test_rate_limit_is_retried_then_reported():
    calls = 0

    def limited(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429, headers={"Retry-After": "0"})

    res = make_client(limited).get("/api/funding")
    assert res.status_code == 503
    assert res.json()["code"] == "upstream_rate_limited"
    assert calls >= 2


def test_health():
    assert make_client(fake_binance).get("/api/health").json() == {"status": "ok"}


def test_coin_endpoint_combines_every_timeframe():
    res = make_client(fake_binance).get("/api/coin/btcusdt")
    assert res.status_code == 200
    body = res.json()
    assert body["symbol"] == "BTCUSDT"
    assert [t["interval"] for t in body["timeframes"]] == ["15m", "1h", "4h", "1d", "1w"]
    assert all(t["metrics"] is not None for t in body["timeframes"])
    assert body["funding"]["funding_rate_pct"] == pytest.approx(0.01)
    assert body["open_interest"]["accounts_ratio"]["long_pct"] == 60.0


def test_coin_endpoint_unknown_symbol():
    res = make_client(fake_binance).get("/api/coin/NOPEUSDT")
    assert res.status_code == 404
    assert res.json()["code"] == "not_found"


def test_concurrent_cold_requests_run_one_scan():
    kline_requests = 0

    def counting(request: httpx.Request) -> httpx.Response:
        nonlocal kline_requests
        if request.url.path == "/fapi/v1/klines":
            kline_requests += 1
        return fake_binance(request)

    app = make_client(counting).app

    async def burst() -> list[int]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            responses = await asyncio.gather(*(client.get("/api/scanner?interval=4h") for _ in range(10)))
        return [r.status_code for r in responses]

    assert asyncio.run(burst()) == [200] * 10
    assert kline_requests == len(SYMBOLS)  # one scan, not ten
