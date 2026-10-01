import { useMemo } from 'react'

import { useScanner } from '../../api/queries'
import type { AnomalyType, ScannerRow } from '../../api/types'
import { DataTable, type Column } from '../../components/DataTable/DataTable'
import { Badge } from '../../components/ui/Badge'
import { FilterBar, MinVolumeSelect, SearchInput, SelectField } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { Legend, PartialDataNotice, QueryState } from '../../components/ui/QueryState'
import { NumCell, PctCell } from '../../components/ui/cells'
import { useUrlEnum } from '../../hooks/useUrlState'
import { applyMarketFilters } from '../../lib/filters'
import { formatMultiplier, formatNumber } from '../../lib/format'
import { SCANNER_INTERVALS, intervalLabel } from '../../lib/intervals'
import { change24hColumn, priceColumn, symbolColumn, volume24hColumn } from '../shared/columns'
import { IntervalControl } from '../shared/IntervalControl'
import { ANOMALY_LABELS } from '../shared/labels'
import { useMarketFilters, useScannerInterval } from '../shared/useMarketFilters'

type TypeFilter = 'anomalies' | 'all' | AnomalyType
const ANOMALY_TYPES = Object.keys(ANOMALY_LABELS) as AnomalyType[]
const TYPE_FILTERS: readonly TypeFilter[] = ['anomalies', 'all', ...ANOMALY_TYPES]

const COLUMNS: Column<ScannerRow>[] = [
  symbolColumn(),
  {
    id: 'type',
    header: 'Tür',
    mobile: 'primary',
    cell: (r) =>
      r.anomaly.type ? (
        <Badge tone={ANOMALY_LABELS[r.anomaly.type].tone} title={ANOMALY_LABELS[r.anomaly.type].description}>
          {ANOMALY_LABELS[r.anomaly.type].label}
        </Badge>
      ) : (
        <span className="muted">—</span>
      ),
    sortValue: (r) => (r.anomaly.type ? ANOMALY_LABELS[r.anomaly.type].label : null),
    firstSortDirection: 'asc',
  },
  {
    id: 'score',
    header: 'Skor',
    description: 'Hacim ve fiyat sapmalarının birleşik büyüklüğü',
    align: 'right',
    cell: (r) => <NumCell>{formatNumber(r.anomaly.score, 2)}</NumCell>,
    sortValue: (r) => r.anomaly.score,
  },
  {
    id: 'candle_return',
    header: 'Mum %',
    description: 'Son kapanmış mumun fiyat değişimi',
    align: 'right',
    mobile: 'primary',
    cell: (r) => <PctCell value={r.anomaly.candle_return_pct} />,
    sortValue: (r) => r.anomaly.candle_return_pct,
  },
  {
    id: 'return_z',
    header: 'Fiyat z',
    description: 'Son mum getirisinin, önceki mumların getirilerine göre standart sapma cinsinden uzaklığı',
    align: 'right',
    cell: (r) => <NumCell>{formatNumber(r.anomaly.return_zscore, 2)}</NumCell>,
    sortValue: (r) => r.anomaly.return_zscore,
  },
  {
    id: 'volume_z',
    header: 'Hacim z',
    description: 'Son mum hacminin (log ölçekte) standart sapma cinsinden uzaklığı',
    align: 'right',
    cell: (r) => <NumCell>{formatNumber(r.volume.zscore, 2)}</NumCell>,
    sortValue: (r) => r.volume.zscore,
  },
  {
    id: 'ratio',
    header: 'Hacim ×',
    align: 'right',
    cell: (r) => <NumCell>{formatMultiplier(r.volume.ratio)}</NumCell>,
    sortValue: (r) => r.volume.ratio,
  },
  change24hColumn(),
  volume24hColumn(),
  priceColumn((r) => r.price),
]

export default function AnomalyPage() {
  const [interval, changeInterval] = useScannerInterval()
  const [typeFilter, setTypeFilter] = useUrlEnum<TypeFilter>('type', 'anomalies', TYPE_FILTERS)
  const { search, setSearch, minVolume, setMinVolume, filters } = useMarketFilters()
  const query = useScanner(interval)

  const rows = useMemo(() => {
    const data = applyMarketFilters(query.data?.rows ?? [], filters)
    if (typeFilter === 'all') return data
    if (typeFilter === 'anomalies') return data.filter((r) => r.anomaly.type !== null)
    return data.filter((r) => r.anomaly.type === typeFilter)
  }, [query.data, filters, typeFilter])

  const baseline = query.data?.params.baseline_candles ?? 50

  return (
    <>
      <PageHeader
        title="Fiyat/Hacim"
        description={`Son kapanmış ${intervalLabel(interval)} mumunun fiyat ve hacim hareketi, önceki ${baseline} mumla istatistiksel olarak karşılaştırılır.`}
        generatedAt={query.data?.meta.generated_at}
        isFetching={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
      <Legend>
        {ANOMALY_TYPES.map((type) => (
          <div key={type}>
            <Badge tone={ANOMALY_LABELS[type].tone}>{ANOMALY_LABELS[type].label}</Badge>
            <span>{ANOMALY_LABELS[type].description}</span>
          </div>
        ))}
      </Legend>
      <FilterBar>
        <IntervalControl value={interval} options={SCANNER_INTERVALS} onChange={changeInterval} />
        <SearchInput value={search} onChange={setSearch} />
        <MinVolumeSelect value={minVolume} onChange={setMinVolume} />
        <SelectField
          label="Tür"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'anomalies', label: 'Tüm anomaliler' },
            { value: 'all', label: 'Tüm coinler' },
            ...ANOMALY_TYPES.map((t) => ({ value: t, label: ANOMALY_LABELS[t].label })),
          ]}
        />
      </FilterBar>
      <QueryState data={query.data} error={query.error} isPending={query.isPending} onRetry={() => void query.refetch()}>
        {(data) => (
          <>
            <PartialDataNotice meta={data.meta} />
            <DataTable
              caption="Fiyat hacim anomalileri"
              rows={rows}
              columns={COLUMNS}
              getRowKey={(r) => r.symbol}
              initialSort={{ columnId: 'score', direction: 'desc' }}
              emptyMessage="Şu an bu kriterlere uyan anomali yok. Farklı bir zaman dilimi deneyin."
            />
          </>
        )}
      </QueryState>
    </>
  )
}
