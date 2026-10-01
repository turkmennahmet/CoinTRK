const LOCALE = 'tr-TR'

const compactUsd = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 2,
})

export const DASH = '—'

/** Prices span 1e-8 … 1e5; keep ~5 significant digits regardless of magnitude. */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH
  const abs = Math.abs(value)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : Math.min(10, Math.max(4, 3 - Math.floor(Math.log10(abs)) + 2))
  return value.toLocaleString(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

export function formatUsdCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH
  return `$${compactUsd.format(value)}`
}

export function formatPct(value: number | null | undefined, digits = 2, signed = true): string {
  if (value == null || !Number.isFinite(value)) return DASH
  const sign = signed && value > 0 ? '+' : ''
  return `${sign}${value.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return DASH
  return value.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatMultiplier(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH
  return `${formatNumber(value, value >= 10 ? 1 : 2)}×`
}

/** "3 dk önce", "az önce" … */
export function formatRelativeTime(timestampMs: number, nowMs: number = Date.now()): string {
  const seconds = Math.round((nowMs - timestampMs) / 1000)
  if (seconds < 10) return 'az önce'
  if (seconds < 60) return `${seconds} sn önce`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} dk önce`
  return `${Math.round(minutes / 60)} sa önce`
}

/** Countdown like "2s 14dk" to a future timestamp. */
export function formatCountdown(targetMs: number, nowMs: number = Date.now()): string {
  const totalMinutes = Math.max(0, Math.floor((targetMs - nowMs) / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}s ${minutes}dk` : `${minutes}dk`
}

export type Tone = 'up' | 'down' | 'neutral'

export function toneOf(value: number | null | undefined, deadZone = 0): Tone {
  if (value == null || !Number.isFinite(value) || Math.abs(value) <= deadZone) return 'neutral'
  return value > 0 ? 'up' : 'down'
}
