from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.core.http import set_cdn_cache
from app.dependencies import get_alpha_scanner_service
from app.schemas.alpha import AlphaScannerResponse
from app.schemas.common import ErrorResponse
from app.schemas.scanner import ScannerInterval
from app.services.alpha import TOKENS_TTL_S, AlphaScannerService

router = APIRouter(
    prefix="/alpha",
    tags=["alpha"],
    responses={502: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)


@router.get(
    "/scanner",
    summary="RSI, MA cross, volume and anomaly metrics for the most liquid Binance Alpha tokens",
)
async def scanner(
    response: Response,
    service: Annotated[AlphaScannerService, Depends(get_alpha_scanner_service)],
    interval: Annotated[ScannerInterval, Query()] = ScannerInterval.H1,
) -> AlphaScannerResponse:
    result = await service.scan(interval)
    # Prices in the response are refreshed from the token list on every request.
    set_cdn_cache(response, TOKENS_TTL_S)
    return result
