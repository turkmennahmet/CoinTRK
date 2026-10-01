import { useDeferredValue } from 'react'

import type { OIPeriod, ScannerInterval } from '../../api/types'
import { useUrlEnum, useUrlNumber, useUrlString } from '../../hooks/useUrlState'
import { MIN_VOLUME_OPTIONS } from '../../lib/filters'
import { OI_PERIODS, SCANNER_INTERVALS } from '../../lib/intervals'

/** Search + minimum volume, shared by every table page and kept in the URL. */
export function useMarketFilters(defaultMinVolume = 0) {
  const [search, setSearch] = useUrlString('q')
  const [minVolume, setMinVolume] = useUrlNumber('minVol', defaultMinVolume, MIN_VOLUME_OPTIONS)
  // Typing stays responsive while large tables re-filter in the background.
  const deferredSearch = useDeferredValue(search)
  return { search, setSearch, minVolume, setMinVolume, filters: { search: deferredSearch, minVolume } }
}

export function useScannerInterval(defaultValue: ScannerInterval = '1h') {
  return useUrlEnum<ScannerInterval>('tf', defaultValue, SCANNER_INTERVALS)
}

export function useOIPeriod(defaultValue: OIPeriod = '4h') {
  return useUrlEnum<OIPeriod>('tf', defaultValue, OI_PERIODS)
}
