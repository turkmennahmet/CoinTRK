"""Binance Alpha (Web3 tokens): the same kline scan as the futures scanner.

Kept apart from the futures services, with its own cache, so Alpha traffic can
neither evict nor slow down the futures data.
"""

from __future__ import annotations

import time
from collections.abc import Iterable
from typing import Any

from app.clients.alpha import AlphaClient, AlphaPair, AlphaToken
from app.clients.models import SymbolInfo, Ticker24h
from app.core.cache import TTLCache
from app.core.revalidate import Revalidator
from app.schemas.alpha import AlphaScannerResponse, AlphaScannerRow
from app.schemas.common import ResponseMeta
from app.schemas.scanner import ScannerInterval
from app.services.klines import KlineStore
from app.services.market import fetch_per_symbol
from app.services.scanner import DEFAULT_CONFIG, SCAN_TTL_S, STALE_S, ScanConfig, compute_symbol_metrics

TOKENS_TTL_S = 30.0
PAIRS_TTL_S = 3600.0
# A token can trade against several stablecoins; candles come from the first one listed here.
QUOTE_PREFERENCE = ("USDT", "USDC", "U")


def preferred_pairs(pairs: Iterable[AlphaPair]) -> dict[str, AlphaPair]:
    """The trading pair to read candles from, keyed by the token's alpha id."""
    best: dict[str, AlphaPair] = {}
    for pair in pairs:
        if pair.status != "TRADING" or pair.quote_asset not in QUOTE_PREFERENCE:
            continue
        current = best.get(pair.base_asset)
        if current is None or QUOTE_PREFERENCE.index(pair.quote_asset) < QUOTE_PREFERENCE.index(
            current.quote_asset
        ):
            best[pair.base_asset] = pair
    return best


class AlphaMarket:
    def __init__(self, client: AlphaClient, cache: TTLCache[object]) -> None:
        self._client = client
        self._cache = cache

    async def tokens(self) -> dict[str, AlphaToken]:
        """Active tokens keyed by alpha id."""

        async def load() -> dict[str, AlphaToken]:
            return {t.alpha_id: t for t in await self._client.tokens() if t.active}

        return await self._cache.get_or_load("alpha_tokens", TOKENS_TTL_S, load)  # type: ignore[return-value]

    async def pairs(self) -> dict[str, AlphaPair]:
        async def load() -> dict[str, AlphaPair]:
            return preferred_pairs(await self._client.pairs())

        return await self._cache.get_or_load("alpha_pairs", PAIRS_TTL_S, load)  # type: ignore[return-value]

    async def most_liquid(self, limit: int) -> list[tuple[AlphaToken, AlphaPair]]:
        """Top ``limit`` tradable tokens by 24h volume, most liquid first."""
        tokens = await self.tokens()
        pairs = await self.pairs()
        ranked = sorted(tokens.values(), key=lambda t: t.volume_24h, reverse=True)
        return [(t, pairs[t.alpha_id]) for t in ranked if t.alpha_id in pairs and t.volume_24h > 0][:limit]


class AlphaScannerService:
    def __init__(
        self,
        client: AlphaClient,
        cache: TTLCache[object],
        revalidator: Revalidator[AlphaClient],
        klines: KlineStore,
        universe_size: int,
        cfg: ScanConfig = DEFAULT_CONFIG,
    ) -> None:
        self._client = client
        self._cache = cache
        self._revalidator = revalidator
        self._klines = klines
        self._universe_size = universe_size
        self._cfg = cfg

    async def scan(self, interval: ScannerInterval) -> AlphaScannerResponse:
        scan = await self._revalidator.get(
            ("alpha_scanner", interval.value),
            SCAN_TTL_S[interval],
            STALE_S,
            lambda client: self._scan(client, interval),
            self._client,
        )
        tokens = await AlphaMarket(self._client, self._cache).tokens()
        return with_live_market_data(scan, tokens, int(time.time() * 1000))

    async def _scan(self, client: AlphaClient, interval: ScannerInterval) -> AlphaScannerResponse:
        # ``client`` is not always self._client: background refreshes bring their own.
        universe = await AlphaMarket(client, self._cache).most_liquid(self._universe_size)
        by_symbol = {pair.symbol: (token, pair) for token, pair in universe}

        started_ms = int(time.time() * 1000)
        klines, failed = await fetch_per_symbol(
            by_symbol,
            lambda symbol: self._klines.fetch(
                client, symbol, interval.value, self._cfg.kline_limit, started_ms
            ),
        )
        self._klines.retain(interval.value, by_symbol)

        now_ms = int(time.time() * 1000)
        rows: list[AlphaScannerRow] = []
        for symbol, candles in klines.items():
            token, pair = by_symbol[symbol]
            info = SymbolInfo(
                symbol=pair.symbol,
                base_asset=token.symbol,
                quote_asset=pair.quote_asset,
                contract_type="ALPHA",
                status=pair.status,
            )
            row = compute_symbol_metrics(info, _ticker(token, pair), candles, now_ms, self._cfg)
            if row is not None:
                rows.append(AlphaScannerRow(**dict(row), **_token_fields(token)))
        rows.sort(key=lambda r: r.quote_volume_24h, reverse=True)

        return AlphaScannerResponse(
            interval=interval,
            params=self._cfg.to_params(),
            meta=ResponseMeta(
                generated_at=now_ms,
                universe_size=len(universe),
                failed_symbols=sorted(by_symbol[s][0].symbol for s in failed),
            ),
            rows=rows,
        )


def with_live_market_data(
    scan: AlphaScannerResponse, tokens: dict[str, AlphaToken], now_ms: int
) -> AlphaScannerResponse:
    """Refresh price, 24h stats and token data of a cached scan (see ``scanner.with_live_prices``)."""
    rows = [
        row.model_copy(
            update={
                "price": t.price,
                "change_24h_pct": t.change_24h_pct,
                "quote_volume_24h": t.volume_24h,
                **_token_fields(t),
            }
        )
        if (t := tokens.get(row.alpha_id))
        else row
        for row in scan.rows
    ]
    rows.sort(key=lambda r: r.quote_volume_24h, reverse=True)
    meta = scan.meta.model_copy(update={"generated_at": now_ms})
    return scan.model_copy(update={"rows": rows, "meta": meta})


def _ticker(token: AlphaToken, pair: AlphaPair) -> Ticker24h:
    return Ticker24h(
        symbol=pair.symbol,
        last_price=token.price,
        price_change_pct=token.change_24h_pct,
        quote_volume=token.volume_24h,
    )


def _token_fields(token: AlphaToken) -> dict[str, Any]:
    return {
        "alpha_id": token.alpha_id,
        "name": token.name,
        "chain": token.chain,
        "contract_address": token.contract_address,
        "market_cap": token.market_cap,
        "liquidity": token.liquidity,
        "holders": token.holders,
        "listing_time": token.listing_time,
    }
