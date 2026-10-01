"""Async client for Binance Alpha (the Web3 tokens listed in Binance Wallet).

Binance publishes no API for Alpha; these are the endpoints binance.com itself
uses. They need no key, wrap every payload in ``{"code": "000000", "data": ...}``
and report errors with HTTP 200 and another code, which ``_data`` turns into
``UpstreamError``. Klines use the same array layout as the futures API.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.clients.base import JsonClient
from app.clients.models import Kline
from app.config import Settings
from app.core.errors import UpstreamError

_OK = "000000"
_PATH = "/bapi/defi/v1/public"


@dataclass(frozen=True, slots=True)
class AlphaToken:
    alpha_id: str
    """Binance's id for the token, e.g. "ALPHA_1214"; the base asset of its trading pairs."""
    symbol: str
    name: str
    chain: str
    contract_address: str
    price: float
    change_24h_pct: float
    volume_24h: float
    market_cap: float
    liquidity: float
    holders: int
    listing_time: int
    active: bool
    """Listed and trading; delisted tokens and tokenised stocks are not."""

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> AlphaToken:
        return cls(
            alpha_id=raw["alphaId"],
            symbol=raw["symbol"],
            name=raw.get("name") or raw["symbol"],
            chain=raw.get("chainName") or "",
            contract_address=raw.get("contractAddress") or "",
            price=_float(raw.get("price")),
            change_24h_pct=_float(raw.get("percentChange24h")),
            volume_24h=_float(raw.get("volume24h")),
            market_cap=_float(raw.get("marketCap")),
            liquidity=_float(raw.get("liquidity")),
            holders=int(_float(raw.get("holders"))),
            listing_time=int(raw.get("listingTime") or 0),
            active=not (raw.get("offline") or raw.get("fullyDelisted") or raw.get("stockState")),
        )


@dataclass(frozen=True, slots=True)
class AlphaPair:
    symbol: str
    """e.g. "ALPHA_1214USDC"."""
    base_asset: str
    quote_asset: str
    status: str

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> AlphaPair:
        return cls(
            symbol=raw["symbol"],
            base_asset=raw["baseAsset"],
            quote_asset=raw["quoteAsset"],
            status=raw["status"],
        )


class AlphaClient(JsonClient):
    def __init__(self, http: httpx.AsyncClient, settings: Settings) -> None:
        super().__init__(http, settings, settings.alpha_max_concurrency)

    async def _data(self, path: str, params: dict[str, Any] | None = None) -> Any:
        body = await self._get(f"{_PATH}{path}", params)
        if not isinstance(body, dict) or body.get("code") != _OK:
            message = body.get("message") if isinstance(body, dict) else None
            raise UpstreamError(f"Binance Alpha verisi alınamadı: {message or 'beklenmeyen yanıt'}.")
        return body["data"]

    async def tokens(self) -> list[AlphaToken]:
        data = await self._data("/wallet-direct/buw/wallet/cex/alpha/all/token/list")
        return [AlphaToken.from_api(item) for item in data if item.get("alphaId")]

    async def pairs(self) -> list[AlphaPair]:
        data = await self._data("/alpha-trade/get-exchange-info")
        return [AlphaPair.from_api(item) for item in data["symbols"]]

    async def klines(self, symbol: str, interval: str, limit: int) -> list[Kline]:
        data = await self._data(
            "/alpha-trade/klines", {"symbol": symbol, "interval": interval, "limit": limit}
        )
        return [Kline.from_api(item) for item in data]


def _float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0
