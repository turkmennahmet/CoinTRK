"""Everything the site knows about one coin, across every timeframe.

A single symbol costs a handful of requests, so this is computed on demand
instead of reading the full scans (which would mean scanning every interval).
"""

from __future__ import annotations

import asyncio
import logging
import time

from app.clients.binance import BinanceClient
from app.clients.models import Kline, SymbolInfo, Ticker24h
from app.core.cache import TTLCache
from app.core.errors import AppError, NotFoundError
from app.schemas.coin import CoinDetailResponse, TimeframeMetrics
from app.schemas.funding import FundingRow
from app.schemas.open_interest import OpenInterestRow
from app.schemas.scanner import ScannerInterval, ScannerRow
from app.services.funding import FundingService
from app.services.klines import KlineStore
from app.services.market import MarketData
from app.services.open_interest import build_oi_row, fetch_long_short, fetch_oi_history
from app.services.scanner import DEFAULT_CONFIG, ScanConfig, compute_symbol_metrics

logger = logging.getLogger(__name__)

COIN_TTL_S = 30.0


class CoinService:
    def __init__(
        self,
        client: BinanceClient,
        market: MarketData,
        funding: FundingService,
        klines: KlineStore,
        cache: TTLCache[object],
        cfg: ScanConfig = DEFAULT_CONFIG,
    ) -> None:
        self._client = client
        self._market = market
        self._funding = funding
        self._klines = klines
        self._cache = cache
        self._cfg = cfg

    async def detail(self, symbol: str) -> CoinDetailResponse:
        symbol = symbol.upper()
        return await self._cache.get_or_load(("coin", symbol), COIN_TTL_S, lambda: self._load(symbol))  # type: ignore[return-value]

    async def _load(self, symbol: str) -> CoinDetailResponse:
        symbols, tickers = await asyncio.gather(self._market.usdt_perpetuals(), self._market.tickers())
        info, ticker = symbols.get(symbol), tickers.get(symbol)
        if info is None or ticker is None:
            raise NotFoundError(f"{symbol} bulunamadı. Sadece Binance USDT vadeli coinleri destekleniyor.")

        now_ms = int(time.time() * 1000)
        candles, funding = await asyncio.gather(
            asyncio.gather(
                *(
                    self._klines.fetch(self._client, symbol, interval.value, self._cfg.kline_limit, now_ms)
                    for interval in ScannerInterval
                ),
                return_exceptions=True,
            ),
            self._funding_row(symbol),
        )
        open_interest = await self._open_interest(info, ticker, funding)

        return CoinDetailResponse(
            symbol=symbol,
            base_asset=info.base_asset,
            price=ticker.last_price,
            change_24h_pct=ticker.price_change_pct,
            quote_volume_24h=ticker.quote_volume,
            generated_at=int(time.time() * 1000),
            params=self._cfg.to_params(),
            timeframes=[
                TimeframeMetrics(interval=interval, metrics=self._metrics(info, ticker, result, now_ms))
                for interval, result in zip(ScannerInterval, candles, strict=True)
            ],
            funding=funding,
            open_interest=open_interest,
        )

    def _metrics(
        self, info: SymbolInfo, ticker: Ticker24h, result: list[Kline] | BaseException, now_ms: int
    ) -> ScannerRow | None:
        if isinstance(result, BaseException):
            if not isinstance(result, AppError):
                logger.exception("Klines for %s failed", info.symbol, exc_info=result)
            return None
        return compute_symbol_metrics(info, ticker, result, now_ms, self._cfg)

    async def _funding_row(self, symbol: str) -> FundingRow | None:
        try:
            rates = await self._funding.rates()
        except AppError:
            return None
        return next((r for r in rates.rows if r.symbol == symbol), None)

    async def _open_interest(
        self, info: SymbolInfo, ticker: Ticker24h, funding: FundingRow | None
    ) -> OpenInterestRow | None:
        try:
            history, ratios = await asyncio.gather(
                fetch_oi_history(self._client, info.symbol), fetch_long_short(self._client, [info.symbol])
            )
        except AppError as exc:
            logger.warning("Open interest for %s unavailable: %s", info.symbol, exc.message)
            return None
        return build_oi_row(
            info,
            ticker,
            history,
            funding.funding_rate_pct / 100.0 if funding else None,
            ratios["accounts"].get(info.symbol),
            ratios["top_positions"].get(info.symbol),
        )
