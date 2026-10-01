"""A small in-process TTL cache.

Serverless instances are reused between invocations while warm, so this cache
absorbs bursts that slip past the CDN (e.g. different query strings hitting the
same instance). It is deliberately process-local and loop-agnostic: it stores
plain data only, never clients or asyncio primitives.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Hashable


class TTLCache[T]:
    def __init__(self, max_entries: int = 64, clock: Callable[[], float] = time.monotonic) -> None:
        self._max_entries = max_entries
        self._clock = clock
        # key -> (fresh until, kept until, value)
        self._data: OrderedDict[Hashable, tuple[float, float, T]] = OrderedDict()

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

    async def get_or_load(self, key: Hashable, ttl_s: float, loader: Callable[[], Awaitable[T]]) -> T:
        cached = self.get(key)
        if cached is not None:
            return cached
        value = await loader()
        self.set(key, value, ttl_s)
        return value
