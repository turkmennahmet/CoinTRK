import { createContext, useContext } from 'react'

/**
 * Which market the current section shows: Binance futures, or the Web3 tokens
 * of Binance Alpha under /web3. Pages read it to pick their data source, so
 * the same page component serves both sections.
 */
export type Market = 'futures' | 'alpha'

export const MarketContext = createContext<Market>('futures')

export function useMarket(): Market {
  return useContext(MarketContext)
}
