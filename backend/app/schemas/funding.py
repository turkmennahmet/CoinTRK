from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import ResponseMeta


class FundingRow(BaseModel):
    symbol: str
    base_asset: str
    mark_price: float
    funding_rate_pct: float = Field(description="Rate applied at the next funding time, in %")
    interval_hours: int
    apr_pct: float = Field(description="Funding rate annualised, in %")
    next_funding_time: int
    change_24h_pct: float
    quote_volume_24h: float


class FundingResponse(BaseModel):
    meta: ResponseMeta
    rows: list[FundingRow]
