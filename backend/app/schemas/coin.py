from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.funding import FundingRow
from app.schemas.open_interest import OpenInterestRow
from app.schemas.scanner import ScannerInterval, ScannerParams, ScannerRow


class TimeframeMetrics(BaseModel):
    interval: ScannerInterval
    metrics: ScannerRow | None = Field(description="None when the coin has too little history")


class CoinDetailResponse(BaseModel):
    symbol: str
    base_asset: str
    price: float
    change_24h_pct: float
    quote_volume_24h: float
    generated_at: int
    params: ScannerParams
    timeframes: list[TimeframeMetrics] = Field(description="One entry per ScannerInterval")
    funding: FundingRow | None
    open_interest: OpenInterestRow | None
