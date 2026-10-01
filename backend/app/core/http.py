from __future__ import annotations

from fastapi import Response


def set_cdn_cache(response: Response, ttl_s: float) -> None:
    """Let Vercel's edge cache serve the response so Binance is hit at most once per TTL.

    Browsers always revalidate (max-age=0); the client-side query cache handles
    freshness in the UI. stale-while-revalidate keeps responses instant while
    the edge refreshes in the background.
    """
    ttl = max(int(ttl_s), 1)
    response.headers["Cache-Control"] = f"public, max-age=0, s-maxage={ttl}, stale-while-revalidate={ttl * 5}"
