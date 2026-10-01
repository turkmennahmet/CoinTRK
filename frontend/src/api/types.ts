// Mirrors backend/app/schemas. Keep in sync when the API contract changes.

export type ScannerInterval = '15m' | '1h' | '4h' | '1d' | '1w'
/** Open interest change window; the same choices as the scanner timeframes. */
export type OIPeriod = ScannerInterval

export type AnomalyType = 'volume_breakout' | 'absorption' | 'thin_move' | 'volume_spike'
export type CrossType = 'golden' | 'death'
export type DivergenceType = 'bullish' | 'bearish'
export type PositioningBias = 'long_buildup' | 'short_buildup' | 'short_covering' | 'long_unwinding'

export interface ResponseMeta {
  generated_at: number
  universe_size: number
  failed_symbols: string[]
}

export interface Cross {
  type: CrossType
  bars_ago: number
}

export interface Divergence {
  type: DivergenceType
  /** Closed candles since the second pivot; it is confirmed `pivot_right` candles later. */
  bars_ago: number
  /** Candles between the two pivots. */
  span: number
  rsi_first: number
  rsi_second: number
  /** Candle low (bullish) or high (bearish) at each pivot. */
  price_first: number
  price_second: number
}

export interface ScannerRow {
  symbol: string
  base_asset: string
  price: number
  change_24h_pct: number
  quote_volume_24h: number
  rsi: number | null
  ma: {
    sma_fast: number | null
    sma_slow: number | null
    ema_fast: number | null
    ema_slow: number | null
    sma_cross: Cross | null
    ema_cross: Cross | null
  }
  volume: {
    last_quote_volume: number
    ratio: number | null
    window_ratio: number | null
    zscore: number | null
  }
  anomaly: {
    candle_return_pct: number | null
    return_zscore: number | null
    type: AnomalyType | null
    score: number | null
  }
  divergences: Divergence[]
}

export interface ScannerParams {
  rsi_period: number
  ma_fast: number
  ma_slow: number
  baseline_candles: number
  volume_window: number
  cross_lookback: number
  pivot_left: number
  pivot_right: number
  divergence_lookback: number
}

export interface ScannerResponse {
  interval: ScannerInterval
  params: ScannerParams
  meta: ResponseMeta
  rows: ScannerRow[]
}

/** A Binance Alpha (Web3) token: the scanner row plus token data. */
export interface AlphaScannerRow extends ScannerRow {
  /** Trading pair the candles come from, e.g. "ALPHA_1214USDC"; `base_asset` is the token ticker. */
  symbol: string
  alpha_id: string
  name: string
  /** Chain as Binance names it, e.g. "BSC", "Solana". */
  chain: string
  contract_address: string
  market_cap: number
  liquidity: number
  holders: number
  listing_time: number
}

export interface FundingRow {
  symbol: string
  base_asset: string
  mark_price: number
  funding_rate_pct: number
  interval_hours: number
  apr_pct: number
  next_funding_time: number
  change_24h_pct: number
  quote_volume_24h: number
}

export interface FundingResponse {
  meta: ResponseMeta
  rows: FundingRow[]
}

export interface OIChange {
  window: OIPeriod
  oi_change_pct: number | null
  price_change_pct: number | null
}

export interface LongShort {
  long_pct: number
  short_pct: number
  /** Long / short */
  ratio: number
}

export interface OpenInterestRow {
  symbol: string
  base_asset: string
  price: number
  open_interest_usd: number
  oi_to_volume: number | null
  funding_rate_pct: number | null
  changes: OIChange[]
  bias: PositioningBias | null
  /** Long/short split of all accounts holding a position. */
  accounts_ratio: LongShort | null
  /** Long/short split of the top traders' positions (by size). */
  top_traders_ratio: LongShort | null
}

export interface OpenInterestResponse {
  period: OIPeriod
  meta: ResponseMeta
  rows: OpenInterestRow[]
}

export interface TimeframeMetrics {
  interval: ScannerInterval
  /** Null when the coin has too little history on this timeframe. */
  metrics: ScannerRow | null
}

export interface CoinDetailResponse {
  symbol: string
  base_asset: string
  price: number
  change_24h_pct: number
  quote_volume_24h: number
  generated_at: number
  params: ScannerParams
  timeframes: TimeframeMetrics[]
  funding: FundingRow | null
  open_interest: OpenInterestRow | null
}

export interface ApiErrorBody {
  code: string
  message: string
}
