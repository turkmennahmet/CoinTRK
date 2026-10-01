import type { OIPeriod, OpenInterestRow } from '../../api/types'

export function oiChange(row: OpenInterestRow, window: OIPeriod): number | null {
  return row.changes.find((c) => c.window === window)?.oi_change_pct ?? null
}

export function oiPriceChange(row: OpenInterestRow, window: OIPeriod): number | null {
  return row.changes.find((c) => c.window === window)?.price_change_pct ?? null
}
