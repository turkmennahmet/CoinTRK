import { describe, expect, it } from 'vitest'

import { applyMarketFilters, matchesSearch } from './filters'
import { formatCountdown, formatPct, formatPrice, formatRelativeTime, formatUsdCompact, toneOf } from './format'
import { spanLabel } from './intervals'
import { sortRows } from './sort'

describe('sortRows', () => {
  const rows = [{ v: 2 }, { v: null }, { v: 5 }, { v: 1 }, { v: Number.NaN }]

  it('sorts ascending and descending with missing values last', () => {
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual([1, 2, 5, null, Number.NaN])
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual([5, 2, 1, null, Number.NaN])
  })

  it('is stable for equal values', () => {
    const tied = [
      { id: 'a', v: 1 },
      { id: 'b', v: 1 },
      { id: 'c', v: 0 },
    ]
    expect(sortRows(tied, (r) => r.v, 'desc').map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts strings', () => {
    expect(sortRows([{ s: 'ETH' }, { s: 'BTC' }], (r) => r.s, 'asc').map((r) => r.s)).toEqual(['BTC', 'ETH'])
  })
})

describe('format', () => {
  it('formats percentages with sign', () => {
    expect(formatPct(1.234)).toBe('+1,23%')
    expect(formatPct(-0.5)).toBe('-0,50%')
    expect(formatPct(null)).toBe('—')
  })

  it('keeps significant digits for tiny prices', () => {
    expect(formatPrice(0.00001234)).toBe('0,00001234')
    expect(formatPrice(83614.1)).toBe('83.614,1')
  })

  it('formats compact USD', () => {
    expect(formatUsdCompact(12_500_000_000)).toMatch(/^\$12,5\s?Mr$/)
  })

  it('formats relative time and countdowns', () => {
    expect(formatRelativeTime(0, 5_000)).toBe('az önce')
    expect(formatRelativeTime(0, 3 * 60_000)).toBe('3 dk önce')
    expect(formatCountdown(2 * 3_600_000 + 14 * 60_000, 0)).toBe('2s 14dk')
    expect(formatCountdown(-1, 0)).toBe('0dk')
  })

  it('derives tone', () => {
    expect(toneOf(1)).toBe('up')
    expect(toneOf(-1)).toBe('down')
    expect(toneOf(0.05, 0.1)).toBe('neutral')
  })
})

describe('filters', () => {
  const rows = [
    { symbol: 'BTCUSDT', base_asset: 'BTC', quote_volume_24h: 1e10 },
    { symbol: '1000PEPEUSDT', base_asset: '1000PEPE', quote_volume_24h: 5e5 },
  ]

  it('matches search case-insensitively on base and symbol', () => {
    expect(matchesSearch(rows[1], 'pepe')).toBe(true)
    expect(matchesSearch(rows[0], ' ')).toBe(true)
    expect(matchesSearch(rows[0], 'eth')).toBe(false)
  })

  it('applies minimum volume', () => {
    expect(applyMarketFilters(rows, { search: '', minVolume: 1e6 }).map((r) => r.base_asset)).toEqual(['BTC'])
  })
})

describe('spanLabel', () => {
  it('converts period counts to human spans', () => {
    expect(spanLabel(1, '15m')).toBe('15dk')
    expect(spanLabel(4, '1h')).toBe('4s')
    expect(spanLabel(24, '1h')).toBe('1g')
    expect(spanLabel(24, '15m')).toBe('6s')
    expect(spanLabel(20, '1d')).toBe('20g')
    expect(spanLabel(3, '1w')).toBe('3hf')
  })
})
