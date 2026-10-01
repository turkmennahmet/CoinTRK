import { keepPreviousData, useQuery } from '@tanstack/react-query'

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
  scanner: (interval: ScannerInterval) => ['scanner', interval] as const,
  funding: () => ['funding'] as const,
  openInterest: (period: OIPeriod) => ['open-interest', period] as const,
  coin: (symbol: string) => ['coin', symbol] as const,
}

const MINUTE = 60_000

export function useScanner(interval: ScannerInterval) {
  return useQuery({
    queryKey: queryKeys.scanner(interval),
    queryFn: ({ signal }) => apiGet<ScannerResponse>('/scanner', { interval }, signal),
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
