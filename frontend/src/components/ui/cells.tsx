import { Link } from 'react-router'

import { formatNumber, formatPct, toneOf } from '../../lib/format'
import { tradingViewUrl } from '../../lib/links'
import styles from './ui.module.css'

/** Base asset linking to the coin's detail page, plus a small link to its TradingView chart. */
export function SymbolCell({ symbol, base }: { symbol: string; base: string }) {
  const quote = symbol.slice(base.length) || 'USDT'
  return (
    <span className={styles.symbolCell}>
      <Link className={styles.symbol} to={`/coin/${encodeURIComponent(symbol)}`} title={`${base} detayları`}>
        <span className={styles.base}>{base}</span>
        <span className={styles.quote}>{quote}</span>
      </Link>
      <a
        className={styles.chartLink}
        href={tradingViewUrl(symbol)}
        target="_blank"
        rel="noopener noreferrer"
        title={`${symbol} grafiğini TradingView'da aç`}
        aria-label={`${symbol} grafiğini TradingView'da aç`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </span>
  )
}

/** A Binance Alpha token: its ticker and chain, with the full name on hover. Alpha has no detail page. */
export function AlphaSymbolCell({ base, name, chain }: { base: string; name: string; chain: string }) {
  return (
    <span className={styles.symbolCell} title={`${name} · ${chain}`}>
      <span className={styles.symbol}>
        <span className={styles.base}>{base}</span>
        <span className={styles.quote}>{chain}</span>
      </span>
    </span>
  )
}

export function PctCell({ value, digits = 2 }: { value: number | null | undefined; digits?: number }) {
  const tone = toneOf(value)
  return <span className={`num ${tone === 'neutral' ? '' : tone}`}>{formatPct(value, digits)}</span>
}

export function NumCell({ children }: { children: string }) {
  return <span className="num">{children}</span>
}

/** Long share as a green bar, short share as a red bar filling the rest. */
export function LongShortBar({
  longPct,
  shortPct,
  ratio,
  wide = false,
}: {
  longPct: number
  shortPct: number
  ratio: number
  /** Fill the container instead of the compact table-cell width. */
  wide?: boolean
}) {
  const long = formatPct(longPct, 1, false)
  const short = formatPct(shortPct, 1, false)
  const label = `Long ${long}, short ${short} (oran ${formatNumber(ratio, 2)})`
  return (
    <span className={`${styles.ls} ${wide ? styles.lsWide : ''}`} title={label} role="img" aria-label={label}>
      <span className={`${styles.lsLabels} num`}>
        <span>L {long}</span>
        <span>S {short}</span>
      </span>
      <span className={styles.lsTrack} aria-hidden="true">
        <span className={styles.lsLong} style={{ width: `calc(${Math.min(100, Math.max(0, longPct))}% - 1px)` }} />
        <span className={styles.lsShort} />
      </span>
    </span>
  )
}

export const RSI_OVERSOLD = 30
export const RSI_OVERBOUGHT = 70

export function RsiCell({ value }: { value: number | null }) {
  if (value == null) return <span className="muted">—</span>
  const zone = value <= RSI_OVERSOLD ? 'low' : value >= RSI_OVERBOUGHT ? 'high' : 'mid'
  return (
    <span className={styles.rsi}>
      <span className={`num ${zone === 'low' ? 'up' : zone === 'high' ? 'down' : ''}`}>{formatNumber(value, 1)}</span>
      <span className={styles.rsiTrack} aria-hidden="true">
        <span className={styles.rsiDot} data-zone={zone} style={{ left: `${Math.min(100, Math.max(0, value))}%` }} />
      </span>
    </span>
  )
}
