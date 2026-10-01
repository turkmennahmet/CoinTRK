"""Stale-while-revalidate on top of ``TTLCache``.

A stale entry is returned straight away and refreshed by a background task, so
only the very first request for a key waits for Binance.

The request's client is closed once the response is sent, so a background
refresh opens its own client through ``session``. On serverless runtimes the
instance may be frozen before the task finishes; the task then simply never
completes, and ``REFRESH_TIMEOUT_S`` lets a later request try again.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable, Hashable
from contextlib import AbstractAsyncContextManager

from app.core.cache import TTLCache

logger = logging.getLogger(__name__)

REFRESH_TIMEOUT_S = 60.0


class Revalidator[C]:
    def __init__(
        self,
        cache: TTLCache[object],
        session: Callable[[], AbstractAsyncContextManager[C]],
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._cache = cache
        self._session = session
        self._clock = clock
        self._refreshing: dict[Hashable, float] = {}
        # Strong references, otherwise the event loop may garbage-collect running tasks.
        self._tasks: set[asyncio.Task[None]] = set()

    async def get[T](
        self,
        key: Hashable,
        ttl_s: float,
        stale_s: float,
        load: Callable[[C], Awaitable[T]],
        client: C,
    ) -> T:
        """Fresh value, else stale value plus a background refresh, else ``load(client)``."""
        hit = self._cache.peek(key)
        if hit is not None:
            value, fresh = hit
            if not fresh:
                self._refresh_in_background(key, ttl_s, stale_s, load)
            return value  # type: ignore[return-value]

        async def load_and_store() -> T:
            loaded = await load(client)
            self._cache.set(key, loaded, ttl_s, stale_s)
            return loaded

        # Concurrent requests on a cold cache share one load (one scan, not one per request).
        return await self._cache.load_once(key, load_and_store)  # type: ignore[return-value]

    def _refresh_in_background[T](
        self, key: Hashable, ttl_s: float, stale_s: float, load: Callable[[C], Awaitable[T]]
    ) -> None:
        now = self._clock()
        started = self._refreshing.get(key)
        if started is not None and now - started < REFRESH_TIMEOUT_S:
            return
        self._refreshing[key] = now

        async def run() -> None:
            try:
                async with self._session() as client:
                    value = await load(client)
                self._cache.set(key, value, ttl_s, stale_s)
            except Exception:
                logger.warning("Background refresh of %r failed", key, exc_info=True)
            finally:
                self._refreshing.pop(key, None)

        task = asyncio.get_running_loop().create_task(run())
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
