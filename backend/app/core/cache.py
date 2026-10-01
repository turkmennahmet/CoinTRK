"""A small in-process TTL cache.

Serverless instances are reused between invocations while warm, so this cache
absorbs bursts that slip past the CDN (e.g. different query strings hitting the
same instance). It is deliberately process-local and loop-agnostic: entries are
plain data only, never clients or asyncio primitives. The one exception, loads
in flight (see ``load_once``), is only ever shared within the loop that started it.
"""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Hashable


class TTLCache[T]:
    def __init__(self, max_entries: int = 64, clock: Callable[[], float] = time.monotonic) -> None:
        self._max_entries = max_entries
        self._clock = clock
        # key -> (fresh until, kept until, value)
        self._data: OrderedDict[Hashable, tuple[float, float, T]] = OrderedDict()
        self._inflight: dict[Hashable, asyncio.Future[T]] = {}

    def get(self, key: Hashable) -> T | None:
        """The value if it is still fresh."""
        hit = self.peek(key)
        return hit[0] if hit is not None and hit[1] else None

    def peek(self, key: Hashable) -> tuple[T, bool] | None:
        """The value and whether it is fresh, as long as it is kept (see ``stale_s``)."""
        entry = self._data.get(key)
        if entry is None:
            return None
        fresh_until, kept_until, value = entry
        now = self._clock()
        if now >= kept_until:
            del self._data[key]
            return None
        self._data.move_to_end(key)
        return value, now < fresh_until

    def set(self, key: Hashable, value: T, ttl_s: float, stale_s: float = 0.0) -> None:
        """Store ``value``, fresh for ``ttl_s`` and then kept as stale for another ``stale_s``."""
        fresh_until = self._clock() + ttl_s
        self._data[key] = (fresh_until, fresh_until + stale_s, value)
        self._data.move_to_end(key)
        while len(self._data) > self._max_entries:
            self._data.popitem(last=False)

    def clear(self) -> None:
        self._data.clear()
        self._inflight.clear()

    async def get_or_load(self, key: Hashable, ttl_s: float, loader: Callable[[], Awaitable[T]]) -> T:
        cached = self.get(key)
        if cached is not None:
            return cached

        async def load_and_store() -> T:
            value = await loader()
            self.set(key, value, ttl_s)
            return value

        return await self.load_once(key, load_and_store)

    async def load_once(self, key: Hashable, loader: Callable[[], Awaitable[T]]) -> T:
        """Run ``loader``, unless a load for ``key`` is already running: then wait for that one.

        Without this, a burst of requests on a cold cache would each start the
        same expensive scan and could exhaust Binance's rate limit together.
        """
        loop = asyncio.get_running_loop()
        while True:
            running = self._inflight.get(key)
            # A load from another event loop (an earlier serverless invocation) cannot be awaited here.
            if running is None or running.get_loop() is not loop:
                break
            try:
                return await asyncio.shield(running)
            except asyncio.CancelledError:
                task = asyncio.current_task()
                if task is not None and task.cancelling():
                    raise
                # The caller doing the load was cancelled, not us: load it ourselves.

        future: asyncio.Future[T] = loop.create_future()
        self._inflight[key] = future
        try:
            value = await loader()
        except asyncio.CancelledError:
            future.cancel()
            raise
        except BaseException as exc:
            future.set_exception(exc)
            future.exception()  # retrieved: no "never retrieved" warning when nobody was waiting
            raise
        else:
            future.set_result(value)
            return value
        finally:
            if self._inflight.get(key) is future:
                del self._inflight[key]
