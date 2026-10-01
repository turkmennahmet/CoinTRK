"""Kline-based scanner: RSI and its divergences, moving-average crosses, volume and price/volume anomalies.

One pass over each symbol's candles produces every metric, so the RSI, golden
cross, volume and anomaly pages all share a single (cached) upstream scan.
"""

from __future__ import annotations

import itertools
import math
import time
from dataclasses import dataclass

from app.clients.binance import BinanceClient
from app.clients.models import Kline, SymbolInfo, Ticker24h
from app.core.cache import TTLCache
from app.core.revalidate import Revalidator
from app.indicators.technical import (
    divergences,
    ema_series,
    last_cross,
    pct_change,
    rsi_series,
    sma_series,
    zscore,
)
from app.schemas.common import ResponseMeta
from app.schemas.scanner import (
    AnomalyStats,
    AnomalyType,
    CrossOut,
    DivergenceOut,
    MovingAverages,
    ScannerInterval,
    ScannerParams,
    ScannerResponse,
    ScannerRow,
    VolumeStats,
)
from app.services.klines import KlineStore
from app.services.market import MarketData, fetch_per_symbol

# Server-side cache per interval. Shorter candles change faster.
SCAN_TTL_S: dict[ScannerInterval, float] = {
    ScannerInterval.M15: 60.0,
    ScannerInterval.H1: 120.0,
    ScannerInterval.H4: 300.0,
    ScannerInterval.D1: 600.0,
    ScannerInterval.W1: 900.0,
}
# After the TTL a scan is still served, while a background task refreshes it.
STALE_S = 1800.0


@dataclass(frozen=True, slots=True)
class ScanConfig:
    rsi_period: int = 14
    ma_fast: int = 50
    ma_slow: int = 200
    baseline_candles: int = 50
    volume_window: int = 3
    cross_lookback: int = 50

    # RSI divergence: pivots need ``pivot_left`` candles before and ``pivot_right`` after
    # (so they are confirmed ``pivot_right`` candles late). TradingView's defaults are 5/5;
    # 3 on the right trades a few false signals for a faster one.
    pivot_left: int = 5
    pivot_right: int = 3
    divergence_min_span: int = 5
    divergence_max_span: int = 60
    divergence_lookback: int = 50

    # Anomaly thresholds, in standard deviations.
    spike_z: float = 2.5
    move_z: float = 2.0
    quiet_move_z: float = 0.75
    thin_volume_z: float = 0.5

    # The most candles Binance still charges weight 2 for (limit in [100, 500)).
    # The slow EMA needs a long warm-up beyond its period to converge to the
    # value charting tools show; 260 candles left EMA200 crosses visibly wrong.
    kline_limit: int = 499

    def to_params(self) -> ScannerParams:
        return ScannerParams(
            rsi_period=self.rsi_period,
            ma_fast=self.ma_fast,
            ma_slow=self.ma_slow,
            baseline_candles=self.baseline_candles,
            volume_window=self.volume_window,
            cross_lookback=self.cross_lookback,
            pivot_left=self.pivot_left,
            pivot_right=self.pivot_right,
            divergence_lookback=self.divergence_lookback,
        )


DEFAULT_CONFIG = ScanConfig()


def closed_candles(klines: list[Kline], now_ms: int) -> list[Kline]:
    """Drop the candle that is still forming; its volume would look artificially low."""
    if klines and klines[-1].close_time >= now_ms:
        return klines[:-1]
    return klines


def classify_anomaly(
    volume_z: float | None, return_z: float | None, cfg: ScanConfig
) -> tuple[AnomalyType | None, float | None]:
    if volume_z is None or return_z is None:
        return None, None
    move = abs(return_z)
    score = math.hypot(max(volume_z, 0.0), move)

    if volume_z >= cfg.spike_z:
        if move >= cfg.move_z:
            return AnomalyType.VOLUME_BREAKOUT, score
        if move < cfg.quiet_move_z:
            return AnomalyType.ABSORPTION, score
        return AnomalyType.VOLUME_SPIKE, score
    if move >= cfg.spike_z and volume_z < cfg.thin_volume_z:
        return AnomalyType.THIN_MOVE, score
    return None, score


def compute_symbol_metrics(
    info: SymbolInfo,
    ticker: Ticker24h,
    klines: list[Kline],
    now_ms: int,
    cfg: ScanConfig = DEFAULT_CONFIG,
) -> ScannerRow | None:
    candles = closed_candles(klines, now_ms)
    # Need at least a baseline plus the evaluated candle to say anything useful.
    if len(candles) < cfg.baseline_candles + 2:
        return None

    closes = [c.close for c in candles]
    sma_fast, sma_slow = sma_series(closes, cfg.ma_fast), sma_series(closes, cfg.ma_slow)
    ema_fast, ema_slow = ema_series(closes, cfg.ma_fast), ema_series(closes, cfg.ma_slow)
    sma_cross = last_cross(sma_fast, sma_slow, cfg.cross_lookback)
    ema_cross = last_cross(ema_fast, ema_slow, cfg.cross_lookback)
    rsi_values = rsi_series(closes, cfg.rsi_period)

    # Volume: compare the latest closed candle(s) with the baseline right before them.
    volumes = [c.quote_volume for c in candles]
    last_volume = volumes[-1]
    baseline_volumes = volumes[-(cfg.baseline_candles + 1) : -1]
    baseline_avg = sum(baseline_volumes) / len(baseline_volumes)
    window = volumes[-cfg.volume_window :]
    window_baseline = volumes[-(cfg.baseline_candles + cfg.volume_window) : -cfg.volume_window]
    window_baseline_avg = sum(window_baseline) / len(window_baseline) if window_baseline else 0.0
    # Volume is heavily right-skewed; log space gives a far more stable z-score.
    volume_z = zscore([math.log1p(v) for v in baseline_volumes], math.log1p(last_volume))

    # Price move of the last closed candle against the baseline's candle returns.
    returns = [
        r for r in (pct_change(a.close, b.close) for a, b in itertools.pairwise(candles)) if r is not None
    ]
    last_return = returns[-1] if returns else None
    return_z = (
        zscore(returns[-(cfg.baseline_candles + 1) : -1], last_return) if last_return is not None else None
    )
    anomaly_type, anomaly_score = classify_anomaly(volume_z, return_z, cfg)

    return ScannerRow(
        symbol=info.symbol,
        base_asset=info.base_asset,
        price=ticker.last_price,
        change_24h_pct=ticker.price_change_pct,
        quote_volume_24h=ticker.quote_volume,
        rsi=_round(rsi_values[-1], 2),
        ma=MovingAverages(
            sma_fast=sma_fast[-1],
            sma_slow=sma_slow[-1],
            ema_fast=ema_fast[-1],
            ema_slow=ema_slow[-1],
            sma_cross=CrossOut(type=sma_cross.type, bars_ago=sma_cross.bars_ago) if sma_cross else None,
            ema_cross=CrossOut(type=ema_cross.type, bars_ago=ema_cross.bars_ago) if ema_cross else None,
        ),
        volume=VolumeStats(
            last_quote_volume=last_volume,
            ratio=_round(last_volume / baseline_avg, 3) if baseline_avg > 0 else None,
            window_ratio=(
                _round((sum(window) / len(window)) / window_baseline_avg, 3)
                if window_baseline_avg > 0
                else None
            ),
            zscore=_round(volume_z, 3),
        ),
        anomaly=AnomalyStats(
            candle_return_pct=_round(last_return, 4),
            return_zscore=_round(return_z, 3),
            type=anomaly_type,
            score=_round(anomaly_score, 3),
        ),
        divergences=rsi_divergences(candles, rsi_values, cfg),
    )


def rsi_divergences(
    candles: list[Kline], rsi_values: list[float | None], cfg: ScanConfig
) -> list[DivergenceOut]:
    lows, highs = [c.low for c in candles], [c.high for c in candles]
    found = divergences(
        rsi_values,
        lows,
        highs,
        [c.close for c in candles],
        cfg.pivot_left,
        cfg.pivot_right,
        cfg.divergence_min_span,
        cfg.divergence_max_span,
    )
    out: list[DivergenceOut] = []
    last = len(candles) - 1
    for d in found:
        rsi_first, rsi_second = rsi_values[d.first], rsi_values[d.second]
        if rsi_first is None or rsi_second is None or last - d.second > cfg.divergence_lookback:
            continue
        prices = lows if d.type == "bullish" else highs
        out.append(
            DivergenceOut(
                type=d.type,
                bars_ago=last - d.second,
                span=d.second - d.first,
                rsi_first=round(rsi_first, 2),
                rsi_second=round(rsi_second, 2),
                price_first=prices[d.first],
                price_second=prices[d.second],
            )
        )
    return out


class ScannerService:
    def __init__(
        self,
        client: BinanceClient,
        market: MarketData,
        cache: TTLCache[object],
        revalidator: Revalidator[BinanceClient],
        klines: KlineStore,
        universe_size: int,
        cfg: ScanConfig = DEFAULT_CONFIG,
    ) -> None:
        self._client = client
        self._market = market
        self._cache = cache
        self._revalidator = revalidator
        self._klines = klines
        self._universe_size = universe_size
        self._cfg = cfg

    async def scan(self, interval: ScannerInterval) -> ScannerResponse:
        scan = await self._revalidator.get(
            ("scanner", interval.value),
            SCAN_TTL_S[interval],
            STALE_S,
            lambda client: self._scan(client, interval),
            self._client,
        )
        # Sequential on purpose: _scan has just warmed the ticker cache on a miss.
        return with_live_prices(scan, await self._market.tickers(), int(time.time() * 1000))

    async def _scan(self, client: BinanceClient, interval: ScannerInterval) -> ScannerResponse:
        # ``client`` is not always self._client: background refreshes bring their own.
        universe = await MarketData(client, self._cache).most_liquid(self._universe_size)
        by_symbol = {info.symbol: (info, ticker) for info, ticker in universe}

        started_ms = int(time.time() * 1000)
        klines, failed = await fetch_per_symbol(
            by_symbol,
            lambda symbol: self._klines.fetch(
                client, symbol, interval.value, self._cfg.kline_limit, started_ms
            ),
        )
        self._klines.retain(interval.value, by_symbol)

        now_ms = int(time.time() * 1000)
        rows: list[ScannerRow] = []
        for symbol, candles in klines.items():
            info, ticker = by_symbol[symbol]
            row = compute_symbol_metrics(info, ticker, candles, now_ms, self._cfg)
            if row is not None:
                rows.append(row)
        rows.sort(key=lambda r: r.quote_volume_24h, reverse=True)

        return ScannerResponse(
            interval=interval,
            params=self._cfg.to_params(),
            meta=ResponseMeta(
                generated_at=now_ms, universe_size=len(universe), failed_symbols=sorted(failed)
            ),
            rows=rows,
        )


def with_live_prices(scan: ScannerResponse, tickers: dict[str, Ticker24h], now_ms: int) -> ScannerResponse:
    """Refresh the ticker fields of a cached scan.

    Candle metrics only change when a candle closes, so the scan can be cached
    for minutes, but price and 24h stats should be as fresh as the ticker.
    """
    rows = [
        row.model_copy(
            update={
                "price": t.last_price,
                "change_24h_pct": t.price_change_pct,
                "quote_volume_24h": t.quote_volume,
            }
        )
        if (t := tickers.get(row.symbol))
        else row
        for row in scan.rows
    ]
    rows.sort(key=lambda r: r.quote_volume_24h, reverse=True)
    meta = scan.meta.model_copy(update={"generated_at": now_ms})
    return scan.model_copy(update={"rows": rows, "meta": meta})


def _round(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)
