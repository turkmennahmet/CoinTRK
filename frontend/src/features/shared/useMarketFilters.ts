import { useDeferredValue } from 'react'

import type { OIPeriod, ScannerInterval } from '../../api/types'
import { useUrlEnum, useUrlNumber, useUrlString } from '../../hooks/useUrlState'
import { MIN_VOLUME_OPTIONS } from '../../lib/filters'
import { useMarket } from '../../app/market'
import { ALPHA_SCANNER_INTERVALS, OI_PERIODS, SCANNER_INTERVALS } from '../../lib/intervals'

/** Search + minimum volume, shared by every table page and kept in the URL. */
export function useMarketFilters(defaultMinVolume = 0) {
  const [search, setSearch] = useUrlString('q')
  const [minVolume, setMinVolume] = useUrlNumber('minVol', defaultMinVolume, MIN_VOLUME_OPTIONS)
  // Typing stays responsive while large tables re-filter in the background.
  const deferredSearch = useDeferredValue(search)
  return { search, setSearch, minVolume, setMinVolume, filters: { search: deferredSearch, minVolume } }
}

/** Timeframes offered in the current section. */
export function useScannerIntervals(): readonly ScannerInterval[] {
  return useMarket() === 'alpha' ? ALPHA_SCANNER_INTERVALS : SCANNER_INTERVALS
}

export function useScannerInterval(defaultValue: ScannerInterval = '1h') {
  return useUrlEnum<ScannerInterval>('tf', defaultValue, useScannerIntervals())
}

export function useOIPeriod(defaultValue: OIPeriod = '4h') {
  return useUrlEnum<OIPeriod>('tf', defaultValue, OI_PERIODS)
}
