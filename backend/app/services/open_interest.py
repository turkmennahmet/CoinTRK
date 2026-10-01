"""Open interest changes, set against price changes over the same windows, plus long/short ratios."""

from __future__ import annotations

import asyncio
import logging
import time

from app.clients.binance import BinanceClient, LongShortKind
from app.clients.models import LongShortRatio, OpenInterestPoint, SymbolInfo, Ticker24h
from app.core.cache import TTLCache
from app.core.errors import AppError
from app.core.revalidate import Revalidator
from app.indicators.technical import pct_change
from app.schemas.common import ResponseMeta
from app.schemas.open_interest import (
    LongShortOut,
    OIChange,
    OIPeriod,
    OpenInterestResponse,
    OpenInterestRow,
    PositioningBias,
)
from app.services.market import MarketData, fetch_per_symbol

logger = logging.getLogger(__name__)

# Every window but 15m comes from one hourly series; Binance keeps 30 days of it.
HOURLY_WINDOWS: dict[OIPeriod, int] = {
    OIPeriod.H1: 1,
    OIPeriod.H4: 4,
    OIPeriod.D1: 24,
    OIPeriod.W1: 168,
}
HOURLY_LIMIT = max(HOURLY_WINDOWS.values()) + 1
QUARTER_LIMIT = 2
# Below this absolute OI change (%) positioning is considered unchanged.
BIAS_MIN_OI_CHANGE_PCT = 0.5

# One scan serves every period: the period only picks which window the bias is read from.
OI_TTL_S = 180.0
# After the TTL a scan is still served, while a background task refreshes it.
STALE_S = 1800.0

# Binance publishes long/short ratios every 5 minutes. They are a snapshot, fetched once
# per TTL; this also keeps us within the 1000 requests per 5 minutes that the
# /futures/data endpoints allow.
LONG_SHORT_PERIOD = "5m"
LONG_SHORT_TTL_S = 300.0
LONG_SHORT_KINDS: tuple[LongShortKind, ...] = ("accounts", "top_positions")

type OIHistory = tuple[list[OpenInterestPoint], list[OpenInterestPoint]]
type LongShortBySymbol = dict[LongShortKind, dict[str, LongShortRatio]]


def classify_bias(oi_change_pct: float | None, price_change_pct: float | None) -> PositioningBias | None:
    if oi_change_pct is None or price_change_pct is None:
        return None
    if abs(oi_change_pct) < BIAS_MIN_OI_CHANGE_PCT:
        return None
    if oi_change_pct > 0:
        return PositioningBias.LONG_BUILDUP if price_change_pct >= 0 else PositioningBias.SHORT_BUILDUP
    return PositioningBias.SHORT_COVERING if price_change_pct >= 0 else PositioningBias.LONG_UNWINDING


def _change(window: OIPeriod, points: list[OpenInterestPoint], back: int) -> OIChange:
    if len(points) <= back:
        return OIChange(window=window, oi_change_pct=None, price_change_pct=None)
    past, latest = points[-1 - back], points[-1]
    past_price, latest_price = past.implied_price, latest.implied_price
    price_change = (
        pct_change(past_price, latest_price) if past_price is not None and latest_price is not None else None
    )
    return OIChange(
        window=window,
        oi_change_pct=_round(pct_change(past.open_interest_value, latest.open_interest_value)),
        price_change_pct=_round(price_change),
    )


def compute_changes(hourly: list[OpenInterestPoint], quarter: list[OpenInterestPoint]) -> list[OIChange]:
    """One change per OIPeriod, in OIPeriod order."""
    return [
        _change(OIPeriod.M15, quarter, 1),
        *(_change(window, hourly, back) for window, back in HOURLY_WINDOWS.items()),
    ]


def bias_for(changes: list[OIChange], period: OIPeriod) -> PositioningBias | None:
    change = next((c for c in changes if c.window == period), None)
    return classify_bias(change.oi_change_pct, change.price_change_pct) if change else None


def build_oi_row(
    info: SymbolInfo,
    ticker: Ticker24h,
    history: OIHistory,
    funding_rate: float | None,
    accounts_ratio: LongShortRatio | None = None,
    top_traders_ratio: LongShortRatio | None = None,
    period: OIPeriod = OIPeriod.H4,
) -> OpenInterestRow | None:
    hourly, quarter = (sorted(points, key=lambda p: p.timestamp) for points in history)
    if not hourly and not quarter:
        return None
    # The 15-minute series has the most recent snapshot.
    latest = max((points[-1] for points in (hourly, quarter) if points), key=lambda p: p.timestamp)
    changes = compute_changes(hourly, quarter)
    return OpenInterestRow(
        symbol=info.symbol,
        base_asset=info.base_asset,
        price=ticker.last_price,
        open_interest_usd=latest.open_interest_value,
        oi_to_volume=(
            round(latest.open_interest_value / ticker.quote_volume, 3) if ticker.quote_volume > 0 else None
        ),
        funding_rate_pct=round(funding_rate * 100.0, 6) if funding_rate is not None else None,
        changes=changes,
        bias=bias_for(changes, period),
        accounts_ratio=_long_short_out(accounts_ratio),
        top_traders_ratio=_long_short_out(top_traders_ratio),
    )


def with_period(scan: OpenInterestResponse, period: OIPeriod) -> OpenInterestResponse:
    """The cached scan with its positioning bias read from ``period``'s window."""
    rows = [row.model_copy(update={"bias": bias_for(row.changes, period)}) for row in scan.rows]
    return scan.model_copy(update={"period": period, "rows": rows})


async def fetch_oi_history(client: BinanceClient, symbol: str) -> OIHistory:
    hourly, quarter = await asyncio.gather(
        client.open_interest_hist(symbol, "1h", HOURLY_LIMIT),
        client.open_interest_hist(symbol, "15m", QUARTER_LIMIT),
    )
    return hourly, quarter


async def fetch_long_short(client: BinanceClient, symbols: list[str]) -> LongShortBySymbol:
    """Latest ratios per kind. Failures leave the ratios empty instead of failing the caller."""

    async def load(kind: LongShortKind) -> dict[str, LongShortRatio]:
        try:
            history, _ = await fetch_per_symbol(
                symbols, lambda symbol: client.long_short_ratio(kind, symbol, LONG_SHORT_PERIOD, 1)
            )
        except AppError as exc:
            logger.warning("Long/short ratios (%s) unavailable: %s", kind, exc.message)
            return {}
        return {symbol: points[-1] for symbol, points in history.items() if points}

    results = await asyncio.gather(*(load(kind) for kind in LONG_SHORT_KINDS))
    return dict(zip(LONG_SHORT_KINDS, results, strict=True))


def _long_short_out(ratio: LongShortRatio | None) -> LongShortOut | None:
    if ratio is None:
        return None
    return LongShortOut(
        long_pct=round(ratio.long_share * 100.0, 2),
        short_pct=round(ratio.short_share * 100.0, 2),
        ratio=round(ratio.ratio, 4),
    )


class OpenInterestService:
    def __init__(
        self,
        client: BinanceClient,
        cache: TTLCache[object],
        revalidator: Revalidator[BinanceClient],
        universe_size: int,
    ) -> None:
        self._client = client
        self._cache = cache
        self._revalidator = revalidator
        self._universe_size = universe_size

    async def scan(self, period: OIPeriod) -> OpenInterestResponse:
        scan = await self._revalidator.get(("open_interest",), OI_TTL_S, STALE_S, self._scan, self._client)
        return with_period(scan, period)

    async def _scan(self, client: BinanceClient) -> OpenInterestResponse:
        # ``client`` is not always self._client: background refreshes bring their own.
        universe, premiums = await asyncio.gather(
            MarketData(client, self._cache).most_liquid(self._universe_size), client.premium_index()
        )
        funding = {p.symbol: p.funding_rate for p in premiums}
        by_symbol = {info.symbol: (info, ticker) for info, ticker in universe}

        (history, failed), long_short = await asyncio.gather(
            fetch_per_symbol(by_symbol, lambda symbol: fetch_oi_history(client, symbol)),
            self._cache.get_or_load(
                "long_short", LONG_SHORT_TTL_S, lambda: fetch_long_short(client, list(by_symbol))
            ),
        )
        ratios: LongShortBySymbol = long_short  # type: ignore[assignment]

        rows: list[OpenInterestRow] = []
        for symbol, points in history.items():
            info, ticker = by_symbol[symbol]
            row = build_oi_row(
                info,
                ticker,
                points,
                funding.get(symbol),
                ratios["accounts"].get(symbol),
                ratios["top_positions"].get(symbol),
            )
            if row is not None:
                rows.append(row)
        rows.sort(key=lambda r: r.open_interest_usd, reverse=True)

        return OpenInterestResponse(
            period=OIPeriod.H4,
            meta=ResponseMeta(
                generated_at=int(time.time() * 1000),
                universe_size=len(universe),
                failed_symbols=sorted(failed),
            ),
            rows=rows,
        )


def _round(value: float | None) -> float | None:
    return None if value is None else round(value, 3)
