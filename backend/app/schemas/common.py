from __future__ import annotations

from pydantic import BaseModel, Field


class ResponseMeta(BaseModel):
    generated_at: int = Field(description="Unix time in ms when the data was computed")
    universe_size: int = Field(description="Number of symbols that were scanned")
    failed_symbols: list[str] = Field(
        default_factory=list, description="Symbols skipped because their upstream request failed"
    )


class ErrorResponse(BaseModel):
    code: str
    message: str
