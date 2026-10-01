import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useMarket, type Market } from '../app/market'
import { apiGet } from './client'
import type {
  CoinDetailResponse,
  FundingResponse,
  OIPeriod,
  OpenInterestResponse,
  ScannerInterval,
  ScannerResponse,
} from './types'

export const queryKeys = {
  scanner: (interval: ScannerInterval, market: Market = 'futures') => ['scanner', market, interval] as const,
  funding: () => ['funding'] as const,
  openInterest: (period: OIPeriod) => ['open-interest', period] as const,
  coin: (symbol: string) => ['coin', symbol] as const,
}

const MINUTE = 60_000

/** Scanner of the current section's market: futures, or Binance Alpha under /web3. */
export function useScanner(interval: ScannerInterval) {
  const market = useMarket()
  return useQuery({
    queryKey: queryKeys.scanner(interval, market),
    queryFn: ({ signal }) =>
      apiGet<ScannerResponse>(market === 'alpha' ? '/alpha/scanner' : '/scanner', { interval }, signal),
    refetchInterval: interval === '15m' ? MINUTE : 2 * MINUTE,
    placeholderData: keepPreviousData,
  })
}

export function useFunding() {
  return useQuery({
    queryKey: queryKeys.funding(),
    queryFn: ({ signal }) => apiGet<FundingResponse>('/funding', {}, signal),
    refetchInterval: 30_000,
  })
}

export function useOpenInterest(period: OIPeriod) {
  return useQuery({
    queryKey: queryKeys.openInterest(period),
    queryFn: ({ signal }) => apiGet<OpenInterestResponse>('/open-interest', { period }, signal),
    refetchInterval: 3 * MINUTE,
    placeholderData: keepPreviousData,
  })
}

export function useCoin(symbol: string) {
  return useQuery({
    queryKey: queryKeys.coin(symbol),
    queryFn: ({ signal }) => apiGet<CoinDetailResponse>(`/coin/${encodeURIComponent(symbol)}`, {}, signal),
    refetchInterval: MINUTE,
  })
}
