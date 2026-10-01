"""Binance Alpha scanner, end to end against a fake binance.com web API."""

from __future__ import annotations

import math
import time
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app import dependencies
from app.clients.alpha import AlphaClient, AlphaPair
from app.config import Settings
from app.main import create_app
from app.services.alpha import preferred_pairs

HOUR_MS = 3_600_000
API = "/bapi/defi/v1/public"


def token(alpha_id: str, symbol: str, volume: float, **flags: Any) -> dict[str, Any]:
    return {
        "alphaId": alpha_id, "symbol": symbol, "name": f"{symbol} Token", "chainName": "BSC",
        "contractAddress": f"0x{alpha_id}", "price": "0.5", "percentChange24h": "12.5",
        "volume24h": str(volume), "marketCap": "1000000", "liquidity": "50000", "holders": "1200",
        "listingTime": 1_700_000_000_000, "offline": False, "fullyDelisted": False, "stockState": False,
        **flags,
    }  # fmt: skip


TOKENS = [
    token("ALPHA_1", "AAA", 5e6),
    token("ALPHA_2", "BBB", 3e6),
    token("ALPHA_3", "OLD", 9e6, offline=True),
    token("ALPHA_4", "STOCK", 9e6, stockState=True),
    token("ALPHA_5", "NOPAIR", 8e6),
]
PAIRS = [
    {"symbol": "ALPHA_1USDT", "baseAsset": "ALPHA_1", "quoteAsset": "USDT", "status": "TRADING"},
    {"symbol": "ALPHA_1USDC", "baseAsset": "ALPHA_1", "quoteAsset": "USDC", "status": "TRADING"},
    {"symbol": "ALPHA_2USDT", "baseAsset": "ALPHA_2", "quoteAsset": "USDT", "status": "DELISTED"},
    {"symbol": "ALPHA_2USDC", "baseAsset": "ALPHA_2", "quoteAsset": "USDC", "status": "TRADING"},
    {"symbol": "ALPHA_3USDT", "baseAsset": "ALPHA_3", "quoteAsset": "USDT", "status": "TRADING"},
    {"symbol": "ALPHA_4USDT", "baseAsset": "ALPHA_4", "quoteAsset": "USDT", "status": "TRADING"},
]


def ok(data: Any) -> httpx.Response:
    return httpx.Response(200, json={"code": "000000", "message": None, "data": data})


def fake_alpha(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path == f"{API}/wallet-direct/buw/wallet/cex/alpha/all/token/list":
        return ok(TOKENS)
    if path == f"{API}/alpha-trade/get-exchange-info":
        return ok({"symbols": PAIRS})
    if path == f"{API}/alpha-trade/klines":
        limit = int(request.url.params["limit"])
        start = int(time.time() * 1000) - (limit + 1) * HOUR_MS
        rows = []
        for i in range(limit):
            close = 1 + 0.1 * math.sin(i / 3)
            t = start + i * HOUR_MS
            end = t + HOUR_MS - 1
            rows.append([str(t), "1", "1.1", "0.9", str(close), "10", str(end), "1000", "1", "5", "500", "0"])
        return ok(rows)
    return httpx.Response(404)


def make_client(handler: Callable[[httpx.Request], httpx.Response]) -> TestClient:
    settings = Settings(http_max_retries=1)

    async def override() -> AsyncIterator[AlphaClient]:
        async with httpx.AsyncClient(
            base_url="https://alpha.test", transport=httpx.MockTransport(handler)
        ) as http:
            yield AlphaClient(http, settings)

    app = create_app()
    app.dependency_overrides[dependencies.get_alpha_client] = override
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_cache():
    dependencies._alpha_cache.clear()
    dependencies._alpha_klines.clear()
    yield
    dependencies._alpha_cache.clear()
    dependencies._alpha_klines.clear()


def test_preferred_pairs_picks_a_trading_stablecoin_pair():
    best = preferred_pairs(AlphaPair.from_api(p) for p in PAIRS)
    assert best["ALPHA_1"].symbol == "ALPHA_1USDT"
    assert best["ALPHA_2"].symbol == "ALPHA_2USDC"  # the USDT pair is delisted


def test_alpha_scanner_scans_active_tradable_tokens():
    res = make_client(fake_alpha).get("/api/alpha/scanner", params={"interval": "1h"})
    assert res.status_code == 200
    assert "s-maxage=30" in res.headers["cache-control"]
    body = res.json()
    assert body["interval"] == "1h"
    # Offline, tokenised-stock and pair-less tokens are left out; most liquid first.
    assert [r["base_asset"] for r in body["rows"]] == ["AAA", "BBB"]
    row = body["rows"][0]
    assert row["symbol"] == "ALPHA_1USDT"
    assert row["alpha_id"] == "ALPHA_1"
    assert row["chain"] == "BSC"
    assert row["holders"] == 1200
    assert row["change_24h_pct"] == 12.5
    assert 0 <= row["rsi"] <= 100


def test_alpha_failed_pairs_are_reported_by_token_symbol():
    def flaky(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/klines") and request.url.params["symbol"] == "ALPHA_2USDC":
            return httpx.Response(200, json={"code": "-1121", "message": "Invalid symbol.", "data": None})
        return fake_alpha(request)

    body = make_client(flaky).get("/api/alpha/scanner").json()
    assert [r["base_asset"] for r in body["rows"]] == ["AAA"]
    assert body["meta"]["failed_symbols"] == ["BBB"]


def test_alpha_error_payload_becomes_upstream_error():
    def broken(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"code": "100001", "message": "busy", "data": None})

    res = make_client(broken).get("/api/alpha/scanner")
    assert res.status_code == 502
    assert res.json()["code"] == "upstream_error"
    assert "busy" in res.json()["message"]
