from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ResponseMeta


class ScannerInterval(StrEnum):
    M15 = "15m"
    H1 = "1h"
    H4 = "4h"
    D1 = "1d"
    W1 = "1w"


class AnomalyType(StrEnum):
    VOLUME_BREAKOUT = "volume_breakout"
    """Unusual volume together with an unusual price move."""
    ABSORPTION = "absorption"
    """Unusual volume while price barely moves: large orders being absorbed."""
    THIN_MOVE = "thin_move"
    """Unusual price move on ordinary or low volume: fragile, easy to reverse."""
    VOLUME_SPIKE = "volume_spike"
    """Unusual volume with a moderate price move."""


class CrossOut(BaseModel):
    type: Literal["golden", "death"]
    bars_ago: int = Field(description="0 = crossed on the last closed candle")


class DivergenceOut(BaseModel):
    type: Literal["bullish", "bearish"]
    bars_ago: int = Field(
        description="Closed candles since the second pivot (confirmed pivot_right candles later)"
    )
    span: int = Field(description="Candles between the two pivots")
    rsi_first: float
    rsi_second: float
    price_first: float = Field(description="Candle low (bullish) or high (bearish) at the first pivot")
    price_second: float


class MovingAverages(BaseModel):
    sma_fast: float | None
    sma_slow: float | None
    ema_fast: float | None
    ema_slow: float | None
    sma_cross: CrossOut | None
    ema_cross: CrossOut | None


class VolumeStats(BaseModel):
    last_quote_volume: float = Field(description="Quote volume (USDT) of the last closed candle")
    ratio: float | None = Field(description="Last closed candle volume / baseline average")
    window_ratio: float | None = Field(
        description="Average volume of the last few closed candles / baseline average"
    )
    zscore: float | None = Field(description="Z-score of log volume against the baseline")


class AnomalyStats(BaseModel):
    candle_return_pct: float | None
    return_zscore: float | None
    type: AnomalyType | None
    score: float | None = Field(description="Combined strength, used for ranking")


class ScannerRow(BaseModel):
    symbol: str
    base_asset: str
    price: float
    change_24h_pct: float
    quote_volume_24h: float
    rsi: float | None
    ma: MovingAverages
    volume: VolumeStats
    anomaly: AnomalyStats
    divergences: list[DivergenceOut] = Field(description="Latest bullish and/or bearish RSI divergence")


class ScannerParams(BaseModel):
    rsi_period: int
    ma_fast: int
    ma_slow: int
    baseline_candles: int
    volume_window: int
    cross_lookback: int
    pivot_left: int
    pivot_right: int
    divergence_lookback: int


class ScannerResponse(BaseModel):
    interval: ScannerInterval
    params: ScannerParams
    meta: ResponseMeta
    rows: list[ScannerRow]
