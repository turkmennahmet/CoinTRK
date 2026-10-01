from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field

from app.schemas.common import ResponseMeta


class OIPeriod(StrEnum):
    """A look-back window for open interest and price changes."""

    M15 = "15m"
    H1 = "1h"
    H4 = "4h"
    D1 = "1d"
    W1 = "1w"


class PositioningBias(StrEnum):
    """What OI and price moving together suggest about positioning."""

    LONG_BUILDUP = "long_buildup"  # OI up, price up
    SHORT_BUILDUP = "short_buildup"  # OI up, price down
    SHORT_COVERING = "short_covering"  # OI down, price up
    LONG_UNWINDING = "long_unwinding"  # OI down, price down


class OIChange(BaseModel):
    window: OIPeriod
    oi_change_pct: float | None
    price_change_pct: float | None


class LongShortOut(BaseModel):
    long_pct: float
    short_pct: float
    ratio: float = Field(description="Long / short")


class OpenInterestRow(BaseModel):
    symbol: str
    base_asset: str
    price: float
    open_interest_usd: float
    oi_to_volume: float | None = Field(description="Open interest / 24h quote volume")
    funding_rate_pct: float | None
    changes: list[OIChange] = Field(description="One entry per OIPeriod, shortest window first")
    bias: PositioningBias | None = Field(description="Derived from the requested period's window")
    accounts_ratio: LongShortOut | None = Field(
        default=None, description="Long/short split of all accounts holding a position"
    )
    top_traders_ratio: LongShortOut | None = Field(
        default=None, description="Long/short split of the top traders' positions (by size)"
    )


class OpenInterestResponse(BaseModel):
    period: OIPeriod = Field(description="Window the positioning bias is derived from")
    meta: ResponseMeta
    rows: list[OpenInterestRow]
