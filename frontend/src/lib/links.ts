/** The perpetual contract's chart on TradingView. */
export function tradingViewUrl(symbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=BINANCE:${encodeURIComponent(symbol)}.P`
}
