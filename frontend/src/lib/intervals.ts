import type { OIPeriod, ScannerInterval } from '../api/types'

export const SCANNER_INTERVALS: readonly ScannerInterval[] = ['15m', '1h', '4h', '1d', '1w']
export const OI_PERIODS: readonly OIPeriod[] = SCANNER_INTERVALS

const MINUTES: Record<ScannerInterval, number> = {
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
  '1w': 10080,
}

const LABELS: Record<ScannerInterval, string> = {
  '15m': '15dk',
  '1h': '1s',
  '4h': '4s',
  '1d': '1g',
  '1w': '1hf',
}

export function intervalLabel(interval: ScannerInterval | OIPeriod): string {
  return LABELS[interval]
}

/** Human label for `count` periods of `interval`, e.g. (4, '1h') → "4s", (24, '1h') → "1g", (2, '1w') → "2hf". */
export function spanLabel(count: number, interval: ScannerInterval | OIPeriod): string {
  if (interval === '1w') return `${count}hf`
  const minutes = count * MINUTES[interval]
  if (minutes < 60) return `${minutes}dk`
  if (minutes < 1440 || minutes % 1440 !== 0) return `${minutes / 60}s`
  return `${minutes / 1440}g`
}
