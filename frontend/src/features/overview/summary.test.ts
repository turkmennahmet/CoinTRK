import { describe, expect, it } from 'vitest'

import type { ScannerRow } from '../../api/types'
import { computeBreadth, median, topBy } from './summary'

function row(overrides: Partial<ScannerRow> & { symbol: string }): ScannerRow {
  return {
    base_asset: overrides.symbol.replace('USDT', ''),
    price: 100,
    change_24h_pct: 0,
    quote_volume_24h: 1e7,
    rsi: 50,
    ma: { sma_fast: null, sma_slow: null, ema_fast: null, ema_slow: null, sma_cross: null, ema_cross: null },
    volume: { last_quote_volume: 0, ratio: null, window_ratio: null, zscore: null },
    anomaly: { candle_return_pct: null, return_zscore: null, type: null, score: null },
    divergences: [],
    ...overrides,
  }
}

describe('median', () => {
  it('handles odd, even and empty inputs', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('computeBreadth', () => {
  it('counts advancers, decliners and coins above the slow EMA', () => {
    const b = computeBreadth([
      row({ symbol: 'AUSDT', change_24h_pct: 2, rsi: 70, ma: { ...row({ symbol: 'x' }).ma, ema_slow: 90 } }),
      row({ symbol: 'BUSDT', change_24h_pct: -1, rsi: 30, ma: { ...row({ symbol: 'x' }).ma, ema_slow: 110 } }),
      row({ symbol: 'CUSDT', change_24h_pct: 0, rsi: null }),
    ])
    expect(b).toMatchObject({ total: 3, advancers: 1, decliners: 1, aboveSlowEma: 1, withSlowEma: 2, medianRsi: 50 })
    expect(b.totalVolume).toBe(3e7)
  })
})

describe('topBy', () => {
  it('ranks, filters and drops missing values', () => {
    const rows = [row({ symbol: 'AUSDT', rsi: 20 }), row({ symbol: 'BUSDT', rsi: null }), row({ symbol: 'CUSDT', rsi: 80 })]
    expect(topBy(rows, (r) => r.rsi, 'desc').map((r) => r.symbol)).toEqual(['CUSDT', 'AUSDT'])
    expect(topBy(rows, (r) => r.rsi, 'asc', 1).map((r) => r.symbol)).toEqual(['AUSDT'])
    expect(topBy(rows, (r) => r.rsi, 'asc', 5, (r) => r.symbol !== 'AUSDT').map((r) => r.symbol)).toEqual(['CUSDT'])
  })
})
