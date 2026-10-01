import type { FundingRow, OpenInterestRow, ScannerRow } from '../../api/types'
import { sortRows, type SortValue } from '../../lib/sort'

/** Illiquid coins produce the most extreme numbers; keep them out of the overview. */
export const OVERVIEW_MIN_VOLUME = 5_000_000

export interface MarketBreadth {
  total: number
  advancers: number
  decliners: number
  aboveSlowEma: number
  withSlowEma: number
  medianRsi: number | null
  totalVolume: number
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function computeBreadth(rows: readonly ScannerRow[]): MarketBreadth {
  let advancers = 0
  let decliners = 0
  let aboveSlowEma = 0
  let withSlowEma = 0
  let totalVolume = 0
  const rsis: number[] = []

  for (const row of rows) {
    if (row.change_24h_pct > 0) advancers++
    else if (row.change_24h_pct < 0) decliners++
    if (row.ma.ema_slow != null) {
      withSlowEma++
      if (row.price > row.ma.ema_slow) aboveSlowEma++
    }
    if (row.rsi != null) rsis.push(row.rsi)
    totalVolume += row.quote_volume_24h
  }

  return {
    total: rows.length,
    advancers,
    decliners,
    aboveSlowEma,
    withSlowEma,
    medianRsi: median(rsis),
    totalVolume,
  }
}

export function topBy<T>(
  rows: readonly T[],
  value: (row: T) => SortValue,
  direction: 'asc' | 'desc',
  limit = 5,
  predicate: (row: T) => boolean = () => true,
): T[] {
  return sortRows(rows.filter(predicate), value, direction)
    .filter((row) => value(row) != null)
    .slice(0, limit)
}

export const isLiquid = (row: { quote_volume_24h: number }) => row.quote_volume_24h >= OVERVIEW_MIN_VOLUME

export function liquidOI(rows: readonly OpenInterestRow[], scanner: readonly ScannerRow[]): OpenInterestRow[] {
  const volume = new Map(scanner.map((r) => [r.symbol, r.quote_volume_24h]))
  return rows.filter((r) => (volume.get(r.symbol) ?? Infinity) >= OVERVIEW_MIN_VOLUME)
}

export function liquidFunding(rows: readonly FundingRow[]): FundingRow[] {
  return rows.filter(isLiquid)
}
