import type { ScannerRow } from '../../api/types'

export type EmaPosition = 'above' | 'below' | 'between'

/** Where price sits relative to the fast and slow EMA; null without enough history. */
export function emaPosition(row: ScannerRow): EmaPosition | null {
  const { ema_fast: fast, ema_slow: slow } = row.ma
  if (fast == null || slow == null) return null
  if (row.price > fast && row.price > slow) return 'above'
  if (row.price < fast && row.price < slow) return 'below'
  return 'between'
}

export function distancePct(price: number, ma: number | null): number | null {
  return ma ? ((price - ma) / ma) * 100 : null
}
