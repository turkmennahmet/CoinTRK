from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import ResponseMeta
from app.schemas.scanner import ScannerInterval, ScannerParams, ScannerRow


class AlphaScannerRow(ScannerRow):
    """A scanner row for a Binance Alpha token.

    ``symbol`` is the trading pair the candles come from (e.g. "ALPHA_1214USDC")
    and ``base_asset`` the token's ticker, which is not unique across chains.
    """

    alpha_id: str
    name: str
    chain: str = Field(description='Chain name as Binance shows it, e.g. "BSC", "Solana"')
    contract_address: str
    market_cap: float
    liquidity: float
    holders: int
    listing_time: int = Field(description="Unix time in ms when the token was listed on Alpha")


class AlphaScannerResponse(BaseModel):
    interval: ScannerInterval
    params: ScannerParams
    meta: ResponseMeta
    rows: list[AlphaScannerRow]
