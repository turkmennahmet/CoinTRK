import math

import pytest

from app.schemas.common import ResponseMeta
from app.schemas.scanner import AnomalyType, ScannerInterval, ScannerResponse
from app.services.scanner import (
    ScanConfig,
    classify_anomaly,
    closed_candles,
    compute_symbol_metrics,
    with_live_prices,
)

from .factories import HOUR_MS, klines, symbol_info, ticker

CFG = ScanConfig(ma_fast=5, ma_slow=10, baseline_candles=20, cross_lookback=10)


def _wiggle(n: int, base: float = 100.0) -> list[float]:
    """Gently oscillating prices so candle returns have a non-zero spread."""
    return [base + math.sin(i) * 0.5 for i in range(n)]


def test_closed_candles_drops_forming_candle():
    candles = klines([1, 2, 3])
    assert len(closed_candles(candles, now_ms=candles[-1].close_time)) == 2
    assert len(closed_candles(candles, now_ms=candles[-1].close_time + 1)) == 3


@pytest.mark.parametrize(
    ("volume_z", "return_z", "expected"),
    [
        (3.0, 2.5, AnomalyType.VOLUME_BREAKOUT),
        (3.0, -2.5, AnomalyType.VOLUME_BREAKOUT),
        (3.0, 0.2, AnomalyType.ABSORPTION),
        (3.0, 1.2, AnomalyType.VOLUME_SPIKE),
        (0.0, 3.0, AnomalyType.THIN_MOVE),
        (1.0, 1.0, None),
        (None, 1.0, None),
    ],
)
def test_classify_anomaly(volume_z, return_z, expected):
    kind, _ = classify_anomaly(volume_z, return_z, ScanConfig())
    assert kind == expected


def test_compute_metrics_flags_volume_breakout_and_golden_cross():
    closes = [*([100.0] * 40), *_wiggle(20, 90.0), 120.0]
    volumes = [1000.0] * (len(closes) - 1) + [20_000.0]
    candles = klines(closes, volumes)
    now = candles[-1].close_time + 1

    row = compute_symbol_metrics(symbol_info(), ticker(), candles, now, CFG)

    assert row is not None
    assert row.volume.ratio == pytest.approx(20.0)
    assert row.anomaly.type == AnomalyType.VOLUME_BREAKOUT
    assert row.anomaly.candle_return_pct is not None and row.anomaly.candle_return_pct > 25
    assert row.ma.sma_cross is not None and row.ma.sma_cross.type == "golden"
    assert row.rsi is not None and row.rsi > 70


def _selloff_then_grind(n_flat: int = 40) -> list[float]:
    """Sharp drop to 80, bounce, slow grind to a lower low (77.6), then recovery."""
    return [
        *_wiggle(n_flat),
        *[94.0, 88.0, 82.0, 80.0],
        *[80.0 + 2 * i for i in range(1, 7)],
        *[92.0 - 1.2 * i for i in range(1, 13)],
        *[77.6 + 1.5 * i for i in range(1, 6)],
    ]


def test_compute_metrics_finds_bullish_rsi_divergence():
    candles = klines(_selloff_then_grind())
    row = compute_symbol_metrics(symbol_info(), ticker(), candles, candles[-1].close_time + 1, CFG)

    assert row is not None
    assert len(row.divergences) == 1
    d = row.divergences[0]
    assert (d.type, d.bars_ago, d.span) == ("bullish", 5, 18)
    assert d.price_second < d.price_first
    assert d.rsi_second > d.rsi_first


def test_compute_metrics_finds_bearish_rsi_divergence():
    candles = klines([200.0 - x for x in _selloff_then_grind()])
    row = compute_symbol_metrics(symbol_info(), ticker(), candles, candles[-1].close_time + 1, CFG)

    assert row is not None
    assert [(d.type, d.bars_ago) for d in row.divergences] == [("bearish", 5)]
    assert row.divergences[0].price_second > row.divergences[0].price_first


def test_compute_metrics_returns_none_without_enough_history():
    candles = klines([100.0] * 10)
    assert compute_symbol_metrics(symbol_info(), ticker(), candles, 10 * HOUR_MS, CFG) is None


def test_with_live_prices_refreshes_ticker_fields_only():
    closes = _wiggle(60)
    candles = klines(closes)
    now = candles[-1].close_time + 1
    rows = [
        compute_symbol_metrics(symbol_info(s), ticker(s, quote_volume=v), candles, now, CFG)
        for s, v in (("BTCUSDT", 2e9), ("ETHUSDT", 1e9))
    ]
    scan = ScannerResponse(
        interval=ScannerInterval.H1,
        params=CFG.to_params(),
        meta=ResponseMeta(generated_at=0, universe_size=2),
        rows=[r for r in rows if r is not None],
    )

    live = with_live_prices(scan, {"ETHUSDT": ticker("ETHUSDT", price=123.0, quote_volume=5e9)}, now_ms=42)

    assert [r.symbol for r in live.rows] == ["ETHUSDT", "BTCUSDT"]
    assert live.rows[0].price == 123.0
    assert live.rows[0].rsi == scan.rows[1].rsi
    assert live.rows[1] == scan.rows[0]
    assert live.meta.generated_at == 42
    assert scan.meta.generated_at == 0
