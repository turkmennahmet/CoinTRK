"""Typed views of Binance USDⓈ-M Futures payloads.

Raw JSON is converted here, at the client boundary, so the rest of the codebase
never deals with stringly-typed numbers or positional kline arrays.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class SymbolInfo:
    symbol: str
    base_asset: str
    quote_asset: str
    contract_type: str
    status: str

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> SymbolInfo:
        return cls(
            symbol=raw["symbol"],
            base_asset=raw["baseAsset"],
            quote_asset=raw["quoteAsset"],
            contract_type=raw["contractType"],
            status=raw["status"],
        )


@dataclass(frozen=True, slots=True)
class Ticker24h:
    symbol: str
    last_price: float
    price_change_pct: float
    quote_volume: float

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> Ticker24h:
        return cls(
            symbol=raw["symbol"],
            last_price=float(raw["lastPrice"]),
            price_change_pct=float(raw["priceChangePercent"]),
            quote_volume=float(raw["quoteVolume"]),
        )


@dataclass(frozen=True, slots=True)
class Kline:
    open_time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    close_time: int
    quote_volume: float

    @classmethod
    def from_api(cls, raw: list[Any]) -> Kline:
        return cls(
            open_time=int(raw[0]),
            open=float(raw[1]),
            high=float(raw[2]),
            low=float(raw[3]),
            close=float(raw[4]),
            volume=float(raw[5]),
            close_time=int(raw[6]),
            quote_volume=float(raw[7]),
        )


@dataclass(frozen=True, slots=True)
class PremiumIndex:
    symbol: str
    mark_price: float
    index_price: float
    # Binance names this "last" but it is the rate that will be charged at next_funding_time.
    funding_rate: float
    next_funding_time: int

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> PremiumIndex:
        return cls(
            symbol=raw["symbol"],
            mark_price=float(raw["markPrice"]),
            index_price=float(raw["indexPrice"]),
            funding_rate=float(raw["lastFundingRate"] or 0.0),
            next_funding_time=int(raw["nextFundingTime"]),
        )


@dataclass(frozen=True, slots=True)
class FundingInfo:
    symbol: str
    interval_hours: int

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> FundingInfo:
        return cls(symbol=raw["symbol"], interval_hours=int(raw["fundingIntervalHours"]))


@dataclass(frozen=True, slots=True)
class OpenInterestPoint:
    timestamp: int
    open_interest: float
    open_interest_value: float

    @property
    def implied_price(self) -> float | None:
        """Mark price at the snapshot, derived from OI value / OI contracts."""
        if self.open_interest <= 0:
            return None
        return self.open_interest_value / self.open_interest

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> OpenInterestPoint:
        return cls(
            timestamp=int(raw["timestamp"]),
            open_interest=float(raw["sumOpenInterest"]),
            open_interest_value=float(raw["sumOpenInterestValue"]),
        )


@dataclass(frozen=True, slots=True)
class LongShortRatio:
    timestamp: int
    long_share: float
    """Share of accounts (or positions) that are long, between 0 and 1."""
    short_share: float
    ratio: float

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> LongShortRatio:
        # Binance uses the "Account" field names for the position-based ratio too.
        return cls(
            timestamp=int(raw["timestamp"]),
            long_share=float(raw["longAccount"]),
            short_share=float(raw["shortAccount"]),
            ratio=float(raw["longShortRatio"]),
        )
