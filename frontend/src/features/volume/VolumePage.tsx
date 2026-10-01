import { useMemo } from 'react'

import { useScanner } from '../../api/queries'
import type { ScannerRow } from '../../api/types'
import { DataTable, type Column } from '../../components/DataTable/DataTable'
import { FilterBar, MinVolumeSelect, SearchInput, SelectField } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { PartialDataNotice, QueryState } from '../../components/ui/QueryState'
import { NumCell, PctCell } from '../../components/ui/cells'
import { useUrlNumber } from '../../hooks/useUrlState'
import { applyMarketFilters } from '../../lib/filters'
import { formatMultiplier, formatNumber, formatUsdCompact } from '../../lib/format'
import { intervalLabel } from '../../lib/intervals'
import { change24hColumn, priceColumn, symbolColumn, volume24hColumn } from '../shared/columns'
import { IntervalControl } from '../shared/IntervalControl'
import { useMarketFilters, useScannerInterval, useScannerIntervals } from '../shared/useMarketFilters'

const MIN_RATIO_OPTIONS = [0, 1.5, 2, 3, 5] as const

export default function VolumePage() {
  const [interval, changeInterval] = useScannerInterval()
  const intervals = useScannerIntervals()
  const [minRatio, setMinRatio] = useUrlNumber('x', 0, MIN_RATIO_OPTIONS)
  const { search, setSearch, minVolume, setMinVolume, filters } = useMarketFilters()
  const query = useScanner(interval)

  const windowSize = query.data?.params.volume_window ?? 3
  const baseline = query.data?.params.baseline_candles ?? 50
  const tf = intervalLabel(interval)

  const columns = useMemo<Column<ScannerRow>[]>(
    () => [
      symbolColumn(),
      {
        id: 'window_ratio',
        header: `Son ${windowSize} mum ×`,
        description: `Son ${windowSize} kapanmış mumun ortalama hacmi / önceki ${baseline} mumun ortalaması`,
        align: 'right',
        mobile: 'primary',
        cell: (r) => <RatioCell value={r.volume.window_ratio} />,
        sortValue: (r) => r.volume.window_ratio,
      },
      {
        id: 'ratio',
        header: 'Son mum ×',
        description: `Son kapanmış mumun hacmi / önceki ${baseline} mumun ortalaması`,
        align: 'right',
        cell: (r) => <RatioCell value={r.volume.ratio} />,
        sortValue: (r) => r.volume.ratio,
      },
      {
        id: 'zscore',
        header: 'Hacim z',
        description: 'Son mum hacminin (log ölçekte) kaç standart sapma yukarıda olduğu',
        align: 'right',
        cell: (r) => <NumCell>{formatNumber(r.volume.zscore, 2)}</NumCell>,
        sortValue: (r) => r.volume.zscore,
      },
      {
        id: 'last_volume',
        header: `Son ${tf} hacim`,
        align: 'right',
        cell: (r) => <NumCell>{formatUsdCompact(r.volume.last_quote_volume)}</NumCell>,
        sortValue: (r) => r.volume.last_quote_volume,
      },
      {
        id: 'candle_return',
        header: 'Son mum %',
        align: 'right',
        cell: (r) => <PctCell value={r.anomaly.candle_return_pct} />,
        sortValue: (r) => r.anomaly.candle_return_pct,
      },
      change24hColumn(),
      volume24hColumn(),
      priceColumn((r) => r.price),
    ],
    [windowSize, baseline, tf],
  )

  const rows = useMemo(() => {
    const data = query.data?.rows ?? []
    return applyMarketFilters(data, filters).filter((r) => minRatio === 0 || (r.volume.window_ratio ?? 0) >= minRatio)
  }, [query.data, filters, minRatio])

  return (
    <>
      <PageHeader
        title="Hacim Patlaması"
        description={`Son mumlarında hacmi kendi ortalamasının çok üstüne çıkan coinler. Hacim, kapanmış ${tf} mumlar üzerinden ölçülür.`}
        generatedAt={query.data?.meta.generated_at}
        isFetching={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
      <FilterBar>
        <IntervalControl value={interval} options={intervals} onChange={changeInterval} />
        <SearchInput value={search} onChange={setSearch} />
        <MinVolumeSelect value={minVolume} onChange={setMinVolume} />
        <SelectField
          label={`Min. son ${windowSize} mum ×`}
          value={minRatio}
          onChange={setMinRatio}
          options={MIN_RATIO_OPTIONS.map((v) => ({ value: v, label: v === 0 ? 'Tümü' : `≥ ${v}×` }))}
        />
      </FilterBar>
      <QueryState data={query.data} error={query.error} isPending={query.isPending} onRetry={() => void query.refetch()}>
        {(data) => (
          <>
            <PartialDataNotice meta={data.meta} />
            <DataTable
              caption="Hacim patlaması"
              rows={rows}
              columns={columns}
              getRowKey={(r) => r.symbol}
              initialSort={{ columnId: 'window_ratio', direction: 'desc' }}
            />
          </>
        )}
      </QueryState>
    </>
  )
}

function RatioCell({ value }: { value: number | null }) {
  const strong = value != null && value >= 2
  return (
    <span className="num" style={strong ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>
      {formatMultiplier(value)}
    </span>
  )
}
