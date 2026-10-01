"""Domain errors that map onto HTTP responses in ``app.main``."""

from __future__ import annotations


class AppError(Exception):
    """Base class for errors that should reach the client with a clean message."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class UpstreamError(AppError):
    """Binance returned an unexpected response or could not be reached."""

    status_code = 502
    code = "upstream_error"


class UpstreamRateLimitedError(UpstreamError):
    """Binance rate limit hit (HTTP 429) or IP temporarily banned (HTTP 418)."""

    status_code = 503
    code = "upstream_rate_limited"


class UpstreamRegionBlockedError(UpstreamError):
    """Binance refuses requests from the server's region (HTTP 451/403)."""

    status_code = 503
    code = "upstream_region_blocked"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"
