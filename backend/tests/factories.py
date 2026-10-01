"""Builders for Binance payloads used across tests."""

from __future__ import annotations

from app.clients.models import Kline, OpenInterestPoint, SymbolInfo, Ticker24h

HOUR_MS = 3_600_000


def symbol_info(symbol: str = "BTCUSDT", base: str = "BTC") -> SymbolInfo:
    return SymbolInfo(
        symbol=symbol, base_asset=base, quote_asset="USDT", contract_type="PERPETUAL", status="TRADING"
    )


def ticker(symbol: str = "BTCUSDT", price: float = 100.0, quote_volume: float = 1e9) -> Ticker24h:
    return Ticker24h(symbol=symbol, last_price=price, price_change_pct=1.5, quote_volume=quote_volume)


def klines(closes: list[float], volumes: list[float] | None = None, start_ms: int = 0) -> list[Kline]:
    volumes = volumes or [1000.0] * len(closes)
    out = []
    prev = closes[0]
    for i, (close, vol) in enumerate(zip(closes, volumes, strict=True)):
        open_time = start_ms + i * HOUR_MS
        out.append(
            Kline(
                open_time=open_time,
                open=prev,
                high=max(prev, close),
                low=min(prev, close),
                close=close,
                volume=vol / close,
                close_time=open_time + HOUR_MS - 1,
                quote_volume=vol,
            )
        )
        prev = close
    return out


def oi_points(values: list[float], prices: list[float]) -> list[OpenInterestPoint]:
    return [
        OpenInterestPoint(timestamp=i * HOUR_MS, open_interest=v / p, open_interest_value=v)
        for i, (v, p) in enumerate(zip(values, prices, strict=True))
    ]
