import { useMemo } from 'react'

import { useScanner } from '../../api/queries'
import type { ScannerRow } from '../../api/types'
import { DataTable, type Column } from '../../components/DataTable/DataTable'
import { FilterBar, MinVolumeSelect, SearchInput } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { PartialDataNotice, QueryState } from '../../components/ui/QueryState'
import { RangeFilter } from '../../components/ui/RangeSlider'
import { NumCell, PctCell, RSI_OVERBOUGHT, RSI_OVERSOLD, RsiCell } from '../../components/ui/cells'
import { PERCENT_VALUES, useUrlRange } from '../../hooks/useUrlState'
import { applyMarketFilters } from '../../lib/filters'
import { formatMultiplier } from '../../lib/format'
import { intervalLabel } from '../../lib/intervals'
import { change24hColumn, priceColumn, symbolColumn, volume24hColumn } from '../shared/columns'
import { IntervalControl } from '../shared/IntervalControl'
import { useMarketFilters, useScannerInterval, useScannerIntervals } from '../shared/useMarketFilters'

const COLUMNS: Column<ScannerRow>[] = [
  symbolColumn(),
  {
    id: 'rsi',
    header: 'RSI',
    mobile: 'primary',
    cell: (r) => <RsiCell value={r.rsi} />,
    sortValue: (r) => r.rsi,
    firstSortDirection: 'asc',
  },
  priceColumn((r) => r.price),
  {
    id: 'candle_return',
    header: 'Son mum %',
    align: 'right',
    cell: (r) => <PctCell value={r.anomaly.candle_return_pct} />,
    sortValue: (r) => r.anomaly.candle_return_pct,
  },
  change24hColumn(),
  {
    id: 'volume_ratio',
    header: 'Hacim ×',
    description: 'Son mum hacmi / ortalama',
    align: 'right',
    cell: (r) => <NumCell>{formatMultiplier(r.volume.ratio)}</NumCell>,
    sortValue: (r) => r.volume.ratio,
  },
  volume24hColumn(),
]

function inRange(rsi: number | null, low: number, high: number): boolean {
  return rsi != null && rsi >= low && rsi <= high
}

export default function RsiPage() {
  const [interval, changeInterval] = useScannerInterval()
  const intervals = useScannerIntervals()
  const [[low, high], setRange] = useUrlRange('lo', 'hi', [RSI_OVERSOLD, RSI_OVERBOUGHT], PERCENT_VALUES)
  const { search, setSearch, minVolume, setMinVolume, filters } = useMarketFilters()
  const query = useScanner(interval)
  const period = query.data?.params.rsi_period ?? 14

  const rows = useMemo(
    () => applyMarketFilters(query.data?.rows ?? [], filters).filter((r) => inRange(r.rsi, low, high)),
    [query.data, filters, low, high],
  )

  return (
    <>
      <PageHeader
        title="RSI Tarayıcı"
        description={`Kapanmış ${intervalLabel(interval)} mumlar üzerinden Wilder RSI(${period}). ${RSI_OVERSOLD} altı aşırı satım, ${RSI_OVERBOUGHT} üstü aşırı alım kabul edilir. Aralığı kaydırıcıyla seçip Filtrele'ye basın; RSI'ı bu aralıkta olan coinler listelenir.`}
        generatedAt={query.data?.meta.generated_at}
        isFetching={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
      <FilterBar>
        <IntervalControl value={interval} options={intervals} onChange={changeInterval} />
        <RangeFilter label="RSI aralığı" min={0} max={100} low={low} high={high} onApply={setRange} />
        <SearchInput value={search} onChange={setSearch} />
        <MinVolumeSelect value={minVolume} onChange={setMinVolume} />
      </FilterBar>
      <QueryState data={query.data} error={query.error} isPending={query.isPending} onRetry={() => void query.refetch()}>
        {(data) => (
          <>
            <PartialDataNotice meta={data.meta} />
            <DataTable
              caption="RSI değerleri"
              rows={rows}
              columns={COLUMNS}
              getRowKey={(r) => r.symbol}
              initialSort={{ columnId: 'rsi', direction: 'asc' }}
              emptyMessage="Bu aralıkta coin yok. Kaydırıcıyı genişletmeyi deneyin."
            />
          </>
        )}
      </QueryState>
    </>
  )
}
