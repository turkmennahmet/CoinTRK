export interface MarketRowLike {
  symbol: string
  base_asset: string
  quote_volume_24h?: number
}

export const MIN_VOLUME_OPTIONS = [0, 1_000_000, 10_000_000, 50_000_000, 100_000_000] as const

/** Search is matched against the base asset and full symbol, case-insensitively. */
export function matchesSearch(row: MarketRowLike, search: string): boolean {
  const needle = search.trim().toUpperCase()
  if (!needle) return true
  return row.base_asset.toUpperCase().includes(needle) || row.symbol.toUpperCase().includes(needle)
}

export function matchesMinVolume(row: MarketRowLike, minVolume: number): boolean {
  if (minVolume <= 0 || row.quote_volume_24h == null) return true
  return row.quote_volume_24h >= minVolume
}

export function applyMarketFilters<T extends MarketRowLike>(
  rows: readonly T[],
  { search, minVolume }: { search: string; minVolume: number },
): T[] {
  return rows.filter((row) => matchesSearch(row, search) && matchesMinVolume(row, minVolume))
}
