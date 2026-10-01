from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response

from app.core.http import set_cdn_cache
from app.dependencies import (
    get_coin_service,
    get_funding_service,
    get_open_interest_service,
    get_scanner_service,
)
from app.schemas.coin import CoinDetailResponse
from app.schemas.common import ErrorResponse
from app.schemas.funding import FundingResponse
from app.schemas.open_interest import OIPeriod, OpenInterestResponse
from app.schemas.scanner import ScannerInterval, ScannerResponse
from app.services.coin import COIN_TTL_S, CoinService
from app.services.funding import FUNDING_TTL_S, FundingService
from app.services.market import TICKERS_TTL_S
from app.services.open_interest import OI_TTL_S, OpenInterestService
from app.services.scanner import ScannerService

router = APIRouter(
    tags=["market"],
    responses={502: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)


@router.get(
    "/scanner",
    summary="RSI, MA cross, volume and anomaly metrics for the most liquid perpetuals",
)
async def scanner(
    response: Response,
    service: Annotated[ScannerService, Depends(get_scanner_service)],
    interval: Annotated[ScannerInterval, Query()] = ScannerInterval.H1,
) -> ScannerResponse:
    result = await service.scan(interval)
    # Prices in the response are refreshed from the ticker on every request.
    set_cdn_cache(response, TICKERS_TTL_S)
    return result


@router.get("/funding", summary="Current funding rate of every USDT perpetual")
async def funding(
    response: Response,
    service: Annotated[FundingService, Depends(get_funding_service)],
) -> FundingResponse:
    result = await service.rates()
    set_cdn_cache(response, FUNDING_TTL_S)
    return result


@router.get("/open-interest", summary="Open interest change versus price change")
async def open_interest(
    response: Response,
    service: Annotated[OpenInterestService, Depends(get_open_interest_service)],
    period: Annotated[OIPeriod, Query()] = OIPeriod.H4,
) -> OpenInterestResponse:
    result = await service.scan(period)
    set_cdn_cache(response, OI_TTL_S)
    return result


@router.get(
    "/coin/{symbol}",
    summary="Every metric for one coin across all timeframes",
    responses={404: {"model": ErrorResponse}},
)
async def coin(
    response: Response,
    service: Annotated[CoinService, Depends(get_coin_service)],
    symbol: Annotated[str, Path(pattern=r"^[A-Za-z0-9]{2,30}$")],
) -> CoinDetailResponse:
    result = await service.detail(symbol)
    set_cdn_cache(response, COIN_TTL_S)
    return result
