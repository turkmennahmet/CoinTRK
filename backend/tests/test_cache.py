import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from app.core.cache import TTLCache
from app.core.revalidate import Revalidator


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_entries_expire_after_ttl():
    clock = FakeClock()
    cache: TTLCache[int] = TTLCache(clock=clock)
    cache.set("a", 1, ttl_s=10)
    assert cache.get("a") == 1
    clock.now = 10
    assert cache.get("a") is None


def test_least_recently_used_entry_is_evicted():
    cache: TTLCache[int] = TTLCache(max_entries=2)
    cache.set("a", 1, 60)
    cache.set("b", 2, 60)
    cache.get("a")
    cache.set("c", 3, 60)
    assert cache.get("a") == 1
    assert cache.get("b") is None


def test_get_or_load_calls_loader_once_while_fresh():
    cache: TTLCache[int] = TTLCache()
    calls = 0

    async def loader() -> int:
        nonlocal calls
        calls += 1
        return 42

    async def run() -> None:
        assert await cache.get_or_load("k", 60, loader) == 42
        assert await cache.get_or_load("k", 60, loader) == 42

    asyncio.run(run())
    assert calls == 1


def test_stale_entries_are_kept_but_not_fresh():
    clock = FakeClock()
    cache: TTLCache[int] = TTLCache(clock=clock)
    cache.set("a", 1, ttl_s=10, stale_s=5)
    assert cache.peek("a") == (1, True)
    clock.now = 12
    assert cache.get("a") is None
    assert cache.peek("a") == (1, False)
    clock.now = 15
    assert cache.peek("a") is None


def test_revalidator_serves_stale_value_and_refreshes_in_background():
    clock = FakeClock()
    cache: TTLCache[object] = TTLCache(clock=clock)
    sessions = 0

    @asynccontextmanager
    async def session() -> AsyncIterator[str]:
        nonlocal sessions
        sessions += 1
        yield "background-client"

    revalidator: Revalidator[str] = Revalidator(cache, session, clock=clock)
    calls: list[str] = []

    async def load(client: str) -> str:
        calls.append(client)
        return f"value {len(calls)}"

    async def scenario() -> list[str]:
        out = [await revalidator.get("k", 10, 100, load, "request-client")]
        clock.now = 20
        out.append(await revalidator.get("k", 10, 100, load, "request-client"))
        out.append(await revalidator.get("k", 10, 100, load, "request-client"))
        await asyncio.sleep(0)  # let the background task run
        out.append(await revalidator.get("k", 10, 100, load, "request-client"))
        return out

    assert asyncio.run(scenario()) == ["value 1", "value 1", "value 1", "value 2"]
    assert calls == ["request-client", "background-client"]
    assert sessions == 1


def test_concurrent_loads_of_a_key_share_one_call():
    cache: TTLCache[int] = TTLCache()
    calls = 0

    async def loader() -> int:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return 42

    async def run() -> list[int]:
        return await asyncio.gather(*(cache.get_or_load("k", 60, loader) for _ in range(10)))

    assert asyncio.run(run()) == [42] * 10
    assert calls == 1


def test_a_failed_shared_load_fails_every_waiter_and_is_retried_next_time():
    cache: TTLCache[int] = TTLCache()
    calls = 0

    async def loader() -> int:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        if calls == 1:
            raise RuntimeError("upstream down")
        return 7

    async def run() -> tuple[list[object], int]:
        first = await asyncio.gather(
            *(cache.get_or_load("k", 60, loader) for _ in range(3)), return_exceptions=True
        )
        return first, await cache.get_or_load("k", 60, loader)

    first, retried = asyncio.run(run())
    assert all(isinstance(r, RuntimeError) for r in first)
    assert retried == 7
    assert calls == 2


def test_waiter_loads_itself_when_the_loading_caller_is_cancelled():
    cache: TTLCache[int] = TTLCache()
    calls = 0

    async def loader() -> int:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)
        return calls

    async def run() -> int:
        leader = asyncio.create_task(cache.get_or_load("k", 60, loader))
        await asyncio.sleep(0)
        waiter = asyncio.create_task(cache.get_or_load("k", 60, loader))
        await asyncio.sleep(0.01)
        leader.cancel()
        return await waiter

    assert asyncio.run(run()) == 2
    assert calls == 2


def test_revalidator_cold_requests_share_one_load():
    cache: TTLCache[object] = TTLCache()

    @asynccontextmanager
    async def session() -> AsyncIterator[str]:
        yield "background-client"

    revalidator: Revalidator[str] = Revalidator(cache, session)
    calls = 0

    async def load(client: str) -> str:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return "scan"

    async def run() -> list[str]:
        return await asyncio.gather(
            *(revalidator.get("k", 10, 100, load, "request-client") for _ in range(10))
        )

    assert asyncio.run(run()) == ["scan"] * 10
    assert calls == 1
