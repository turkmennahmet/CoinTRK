import math

import pytest

from app.indicators.technical import (
    divergences,
    ema_series,
    last_cross,
    pct_change,
    pivots,
    rsi,
    rsi_series,
    sma_series,
    zscore,
)


def test_sma_series_aligns_with_input():
    assert sma_series([1, 2, 3, 4, 5], 3) == [None, None, 2.0, 3.0, 4.0]


def test_ema_is_seeded_with_sma_and_follows_price():
    out = ema_series([1, 2, 3, 4, 5], 3)
    assert out[:2] == [None, None]
    assert out[2] == pytest.approx(2.0)
    # alpha = 0.5 for period 3
    assert out[3] == pytest.approx(3.0)
    assert out[4] == pytest.approx(4.0)


def test_ema_returns_all_none_when_too_short():
    assert ema_series([1, 2], 3) == [None, None]


@pytest.mark.parametrize("period", [0, -1])
def test_invalid_period_raises(period):
    with pytest.raises(ValueError):
        sma_series([1, 2, 3], period)


def test_rsi_extremes():
    assert rsi(list(range(1, 30))) == 100.0
    assert rsi(list(range(30, 1, -1))) == pytest.approx(0.0)
    assert rsi([5.0] * 20) == 50.0


def test_rsi_needs_period_plus_one_values():
    assert rsi([1.0] * 14, period=14) is None


def test_rsi_matches_reference_value():
    # Classic example from Wilder's "New Concepts in Technical Trading Systems"
    closes = [
        44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
        45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64,
    ]  # fmt: skip
    assert rsi(closes[:15]) == pytest.approx(70.46, abs=0.05)


def test_rsi_series_ends_with_rsi_and_aligns_with_input():
    closes = [100 + (i % 7) - (i % 3) * 1.5 for i in range(40)]
    series = rsi_series(closes)
    assert len(series) == len(closes)
    assert series[:14] == [None] * 14
    assert series[-1] == rsi(closes)
    assert series[20] == rsi(closes[:21])


def test_pivots_need_both_sides():
    values = [5.0, 4.0, 3.0, 4.0, 5.0, 2.0, 5.0]
    assert pivots(values, left=2, right=2, low=True) == [2]
    # The 2.0 has only one value after it.
    assert pivots(values, left=2, right=1, low=True) == [2, 5]
    assert pivots([1.0, 3.0, 1.0, 1.0], left=1, right=1, low=False) == [1]
    assert pivots([None, 5.0, 3.0, 5.0], left=2, right=1, low=True) == []


def _series(*points: tuple[int, float], length: int, base: float) -> list[float]:
    out = [base] * length
    for i, value in points:
        out[i] = value
    return out


def test_bullish_divergence():
    # RSI: higher low (20 -> 30); price: lower low (90 -> 85).
    osc = _series((5, 20.0), (15, 30.0), length=20, base=50.0)
    lows = _series((5, 90.0), (15, 85.0), length=20, base=100.0)
    found = divergences(osc, lows, [110.0] * 20, [100.0] * 20, left=3, right=3, min_span=5, max_span=60)
    assert [(d.type, d.first, d.second) for d in found] == [("bullish", 5, 15)]


def test_bearish_divergence():
    # RSI: lower high (80 -> 70); price: higher high (110 -> 115).
    osc = _series((5, 80.0), (15, 70.0), length=20, base=50.0)
    highs = _series((5, 110.0), (15, 115.0), length=20, base=100.0)
    found = divergences(osc, [90.0] * 20, highs, [100.0] * 20, left=3, right=3, min_span=5, max_span=60)
    assert [(d.type, d.first, d.second) for d in found] == [("bearish", 5, 15)]


def test_no_divergence_when_price_confirms_rsi():
    osc = _series((5, 20.0), (15, 30.0), length=20, base=50.0)
    lows = _series((5, 85.0), (15, 90.0), length=20, base=100.0)
    assert divergences(osc, lows, [110.0] * 20, [100.0] * 20, 3, 3, 5, 60) == []


def test_divergence_respects_span_and_invalidation():
    osc = _series((5, 20.0), (15, 30.0), length=20, base=50.0)
    lows = _series((5, 90.0), (15, 85.0), length=20, base=100.0)
    highs = [110.0] * 20
    assert divergences(osc, lows, highs, [100.0] * 20, 3, 3, min_span=11, max_span=60) == []
    assert divergences(osc, lows, highs, [100.0] * 20, 3, 3, min_span=5, max_span=9) == []
    # A close below the second low breaks the setup.
    closes = _series((18, 84.0), length=20, base=100.0)
    assert divergences(osc, lows, highs, closes, 3, 3, 5, 60) == []


def test_zscore():
    assert zscore([1, 2, 3, 4, 5], 3) == pytest.approx(0.0)
    assert zscore([1, 2, 3, 4, 5], 3 + math.sqrt(2.5)) == pytest.approx(1.0)
    assert zscore([2, 2, 2], 5) is None
    assert zscore([1], 5) is None


def test_last_cross_detects_golden_cross():
    fast = [1.0, 1.0, 1.0, 3.0, 3.0]
    slow = [2.0, 2.0, 2.0, 2.0, 2.0]
    cross = last_cross(fast, slow, lookback=10)
    assert cross is not None
    assert (cross.type, cross.bars_ago) == ("golden", 1)


def test_last_cross_detects_death_cross_on_last_bar():
    fast = [3.0, 3.0, 1.0]
    slow = [2.0, 2.0, 2.0]
    cross = last_cross(fast, slow, lookback=5)
    assert cross is not None
    assert (cross.type, cross.bars_ago) == ("death", 0)


def test_last_cross_respects_lookback_and_missing_data():
    fast = [1.0, 3.0, 3.0, 3.0, 3.0]
    slow = [2.0, 2.0, 2.0, 2.0, 2.0]
    assert last_cross(fast, slow, lookback=2) is None
    assert last_cross([None, None, 3.0], [None, 2.0, 2.0], lookback=5) is None


def test_pct_change():
    assert pct_change(100, 110) == pytest.approx(10.0)
    assert pct_change(0, 5) is None
