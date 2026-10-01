"""Pure technical-analysis functions.

All series functions return a list aligned with the input: position ``i`` holds
the indicator value for input ``i`` or ``None`` while there is not enough data.
No numpy on purpose: a few hundred points per symbol is trivial work and it
keeps the serverless bundle and cold start small.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

CrossType = Literal["golden", "death"]
DivergenceType = Literal["bullish", "bearish"]


def sma_series(values: Sequence[float], period: int) -> list[float | None]:
    _check_period(period)
    out: list[float | None] = [None] * len(values)
    window_sum = 0.0
    for i, value in enumerate(values):
        window_sum += value
        if i >= period:
            window_sum -= values[i - period]
        if i >= period - 1:
            out[i] = window_sum / period
    return out


def ema_series(values: Sequence[float], period: int) -> list[float | None]:
    """EMA seeded with the SMA of the first ``period`` values."""
    _check_period(period)
    out: list[float | None] = [None] * len(values)
    if len(values) < period:
        return out
    alpha = 2.0 / (period + 1)
    ema = sum(values[:period]) / period
    out[period - 1] = ema
    for i in range(period, len(values)):
        ema = alpha * values[i] + (1 - alpha) * ema
        out[i] = ema
    return out


def rsi_series(closes: Sequence[float], period: int = 14) -> list[float | None]:
    """Wilder's RSI for every value in ``closes``."""
    _check_period(period)
    out: list[float | None] = [None] * len(closes)
    if len(closes) < period + 1:
        return out

    gain_sum = loss_sum = 0.0
    for i in range(1, period + 1):
        delta = closes[i] - closes[i - 1]
        gain_sum += max(delta, 0.0)
        loss_sum += max(-delta, 0.0)
    avg_gain = gain_sum / period
    avg_loss = loss_sum / period
    out[period] = _rsi_value(avg_gain, avg_loss)

    for i in range(period + 1, len(closes)):
        delta = closes[i] - closes[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(delta, 0.0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-delta, 0.0)) / period
        out[i] = _rsi_value(avg_gain, avg_loss)
    return out


def rsi(closes: Sequence[float], period: int = 14) -> float | None:
    """Wilder's RSI of the last value in ``closes``."""
    series = rsi_series(closes, period)
    return series[-1] if series else None


def _rsi_value(avg_gain: float, avg_loss: float) -> float:
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return 100.0 - 100.0 / (1.0 + rs)


def zscore(sample: Sequence[float], value: float) -> float | None:
    """How many standard deviations ``value`` lies from the mean of ``sample``."""
    if len(sample) < 2:
        return None
    mean = sum(sample) / len(sample)
    variance = sum((x - mean) ** 2 for x in sample) / (len(sample) - 1)
    std = math.sqrt(variance)
    if std == 0:
        return None
    return (value - mean) / std


@dataclass(frozen=True, slots=True)
class Cross:
    type: CrossType
    bars_ago: int


def last_cross(fast: Sequence[float | None], slow: Sequence[float | None], lookback: int) -> Cross | None:
    """Most recent crossover of ``fast`` over/under ``slow`` in the last ``lookback`` bars.

    ``bars_ago == 0`` means the cross happened on the last bar.
    """
    if len(fast) != len(slow):
        raise ValueError("fast and slow series must have the same length")
    last = len(fast) - 1
    earliest = max(1, last - lookback + 1)
    for i in range(last, earliest - 1, -1):
        f_now, s_now, f_prev, s_prev = fast[i], slow[i], fast[i - 1], slow[i - 1]
        if f_now is None or s_now is None or f_prev is None or s_prev is None:
            return None
        if f_prev <= s_prev and f_now > s_now:
            return Cross("golden", last - i)
        if f_prev >= s_prev and f_now < s_now:
            return Cross("death", last - i)
    return None


@dataclass(frozen=True, slots=True)
class Divergence:
    type: DivergenceType
    first: int
    """Index of the earlier pivot."""
    second: int
    """Index of the later pivot."""


def pivots(values: Sequence[float | None], left: int, right: int, *, low: bool) -> list[int]:
    """Indices of pivot lows (or highs).

    A pivot lies strictly beyond the ``left`` values before it and at least as far as the
    ``right`` values after it. It is only known once those ``right`` values exist, so the last
    ``right`` values never qualify.
    """
    sign = 1.0 if low else -1.0
    out: list[int] = []
    for i in range(left, len(values) - right):
        value = values[i]
        before, after = values[i - left : i], values[i + 1 : i + right + 1]
        if value is None or None in before or None in after:
            continue
        v = sign * value
        beats_before = all(v < sign * x for x in before if x is not None)
        if beats_before and all(v <= sign * x for x in after if x is not None):
            out.append(i)
    return out


def divergences(
    osc: Sequence[float | None],
    lows: Sequence[float],
    highs: Sequence[float],
    closes: Sequence[float],
    left: int,
    right: int,
    min_span: int,
    max_span: int,
) -> list[Divergence]:
    """Regular divergence between the last two oscillator pivots, as in TradingView's RSI Divergence.

    Bullish: the oscillator makes a higher low while price makes a lower low. Bearish is the mirror
    image on highs. A divergence is dropped once price has closed beyond its second pivot.
    """
    if not len(osc) == len(lows) == len(highs) == len(closes):
        raise ValueError("all series must have the same length")
    out: list[Divergence] = []
    kinds: tuple[tuple[DivergenceType, Sequence[float], float], ...] = (
        ("bullish", lows, 1.0),
        ("bearish", highs, -1.0),
    )
    for kind, prices, sign in kinds:
        found = pivots(osc, left, right, low=sign > 0)
        if len(found) < 2:
            continue
        first, second = found[-2], found[-1]
        osc_first, osc_second = osc[first], osc[second]
        if osc_first is None or osc_second is None or not min_span <= second - first <= max_span:
            continue
        if not (sign * osc_second > sign * osc_first and sign * prices[second] < sign * prices[first]):
            continue
        if any(sign * c < sign * prices[second] for c in closes[second + 1 :]):
            continue
        out.append(Divergence(kind, first, second))
    return out


def pct_change(old: float, new: float) -> float | None:
    if old == 0:
        return None
    return (new - old) / old * 100.0


def _check_period(period: int) -> None:
    if period < 1:
        raise ValueError("period must be >= 1")
