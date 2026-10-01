"""Retrying JSON GET shared by the Binance clients."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.config import Settings
from app.core.errors import UpstreamError, UpstreamRateLimitedError, UpstreamRegionBlockedError

logger = logging.getLogger(__name__)

_RETRYABLE_STATUS = frozenset({500, 502, 503, 504})
_MAX_BACKOFF_S = 4.0


class JsonClient:
    """GETs JSON with retries on transient failures and clean errors for the rest.

    One instance is created per request (see ``app.dependencies``) because an
    ``httpx.AsyncClient`` is bound to the event loop it was created on, and
    serverless runtimes do not guarantee the same loop across invocations.
    """

    def __init__(self, http: httpx.AsyncClient, settings: Settings, max_concurrency: int) -> None:
        self._http = http
        self._settings = settings
        self._semaphore = asyncio.Semaphore(max_concurrency)

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        attempts = self._settings.http_max_retries + 1
        for attempt in range(attempts):
            is_last = attempt == attempts - 1
            async with self._semaphore:
                try:
                    response = await self._http.get(path, params=params)
                except httpx.TransportError as exc:
                    if is_last:
                        raise UpstreamError(f"Binance'e ulaşılamadı: {exc.__class__.__name__}") from exc
                    await asyncio.sleep(self._backoff(attempt))
                    continue

            status = response.status_code
            if status == 200:
                return response.json()
            if status in (403, 451):
                raise UpstreamRegionBlockedError(
                    "Binance bu sunucu bölgesinden gelen istekleri engelliyor. "
                    "Vercel fonksiyon bölgesini fra1 gibi desteklenen bir bölgeye alın."
                )
            if status in (418, 429):
                retry_after = _parse_retry_after(response)
                if is_last or retry_after > _MAX_BACKOFF_S:
                    raise UpstreamRateLimitedError(
                        "Binance istek limiti aşıldı, lütfen biraz sonra tekrar deneyin."
                    )
                await asyncio.sleep(retry_after or self._backoff(attempt))
                continue
            if status in _RETRYABLE_STATUS and not is_last:
                await asyncio.sleep(self._backoff(attempt))
                continue

            logger.warning("Binance %s returned %s: %s", path, status, response.text[:200])
            raise UpstreamError(f"Binance beklenmeyen yanıt döndü (HTTP {status}).")

        raise UpstreamError("Binance isteği başarısız oldu.")  # pragma: no cover

    @staticmethod
    def _backoff(attempt: int) -> float:
        return float(min(0.25 * 2**attempt, _MAX_BACKOFF_S))


def _parse_retry_after(response: httpx.Response) -> float:
    try:
        return float(response.headers.get("Retry-After", "0"))
    except ValueError:
        return 0.0
