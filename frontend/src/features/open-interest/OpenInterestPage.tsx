import { useMemo } from 'react'

import { useOpenInterest } from '../../api/queries'
import type { LongShort, OIPeriod, OpenInterestRow, PositioningBias } from '../../api/types'
import { DataTable, type Column } from '../../components/DataTable/DataTable'
import { Badge } from '../../components/ui/Badge'
import { FilterBar, SearchInput, SelectField } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { Legend, PartialDataNotice, QueryState } from '../../components/ui/QueryState'
import { LongShortBar, NumCell, PctCell } from '../../components/ui/cells'
import { useUrlEnum } from '../../hooks/useUrlState'
import { applyMarketFilters } from '../../lib/filters'
import { formatNumber, formatUsdCompact } from '../../lib/format'
import { OI_PERIODS, intervalLabel } from '../../lib/intervals'
import { symbolColumn } from '../shared/columns'
import { IntervalControl } from '../shared/IntervalControl'
import { BIAS_LABELS } from '../shared/labels'
import { oiChange, oiPriceChange } from './changes'
import { useMarketFilters, useOIPeriod } from '../shared/useMarketFilters'

type BiasFilter = PositioningBias | 'all'
const BIASES = Object.keys(BIAS_LABELS) as PositioningBias[]
const BIAS_FILTERS: readonly BiasFilter[] = ['all', ...BIASES]

const WINDOW_TEXT: Record<OIPeriod, string> = {
  '15m': '15 dakikada',
  '1h': '1 saatte',
  '4h': '4 saatte',
  '1d': '24 saatte',
  '1w': '7 günde',
}

function longShortColumn(
  id: string,
  header: string,
  description: string,
  get: (row: OpenInterestRow) => LongShort | null,
): Column<OpenInterestRow> {
  return {
    id,
    header,
    description,
    cell: (r) => {
      const ls = get(r)
      return ls ? (
        <LongShortBar longPct={ls.long_pct} shortPct={ls.short_pct} ratio={ls.ratio} />
      ) : (
        <span className="muted">—</span>
      )
    },
    sortValue: (r) => get(r)?.long_pct ?? null,
    mobile: 'wide',
  }
}

function buildColumns(period: OIPeriod): Column<OpenInterestRow>[] {
  return [
    symbolColumn(),
    {
      id: 'oi',
      header: 'Open Interest',
      align: 'right',
      cell: (r) => <NumCell>{formatUsdCompact(r.open_interest_usd)}</NumCell>,
      sortValue: (r) => r.open_interest_usd,
    },
    {
      id: 'oi_change',
      header: `OI Değişimi · ${intervalLabel(period)}`,
      description: `Son ${WINDOW_TEXT[period]} açık pozisyon büyüklüğündeki değişim`,
      align: 'right',
      mobile: 'primary',
      cell: (r) => <PctCell value={oiChange(r, period)} />,
      sortValue: (r) => oiChange(r, period),
    },
    {
      id: 'price_change',
      header: `Fiyat Değişimi · ${intervalLabel(period)}`,
      description: `Son ${WINDOW_TEXT[period]} fiyat değişimi. Pozisyonlanma bu pencereye göre hesaplanır.`,
      align: 'right',
      cell: (r) => <PctCell value={oiPriceChange(r, period)} />,
      sortValue: (r) => oiPriceChange(r, period),
    },
    {
      id: 'bias',
      header: 'Pozisyonlanma',
      description: `Son ${WINDOW_TEXT[period]} OI ve fiyat değişiminin yönü`,
      mobile: 'primary',
      cell: (r) =>
        r.bias ? (
          <Badge tone={BIAS_LABELS[r.bias].tone} title={BIAS_LABELS[r.bias].description}>
            {BIAS_LABELS[r.bias].label}
          </Badge>
        ) : (
          <span className="muted">Nötr</span>
        ),
      sortValue: (r) => (r.bias ? BIAS_LABELS[r.bias].label : null),
      firstSortDirection: 'asc',
    },
    longShortColumn(
      'accounts_ratio',
      'L/S · Tüm Hesaplar',
      'Pozisyonu olan hesapların yüzde kaçı long, yüzde kaçı short. Çoğunlukla küçük yatırımcının yönünü gösterir.',
      (r) => r.accounts_ratio,
    ),
    longShortColumn(
      'top_traders_ratio',
      'L/S · Büyük Trader',
      'En büyük hesapların toplam pozisyon büyüklüğünün yüzde kaçı long, yüzde kaçı short.',
      (r) => r.top_traders_ratio,
    ),
    {
      id: 'funding',
      header: 'Funding',
      align: 'right',
      cell: (r) => <PctCell value={r.funding_rate_pct} digits={4} />,
      sortValue: (r) => r.funding_rate_pct,
    },
    {
      id: 'oi_to_volume',
      header: 'OI / Hacim',
      description: 'Open interest / 24 saatlik hacim. Yüksek değer, hacme göre kalabalık pozisyonlanmayı gösterir.',
      align: 'right',
      cell: (r) => <NumCell>{formatNumber(r.oi_to_volume, 2)}</NumCell>,
      sortValue: (r) => r.oi_to_volume,
    },
  ]
}

export default function OpenInterestPage() {
  const [period, changePeriod] = useOIPeriod()
  const [bias, setBias] = useUrlEnum<BiasFilter>('bias', 'all', BIAS_FILTERS)
  const { search, setSearch, filters } = useMarketFilters()
  const query = useOpenInterest(period)

  const columns = useMemo(() => buildColumns(period), [period])
  const rows = useMemo(() => {
    const data = applyMarketFilters(query.data?.rows ?? [], filters)
    return bias === 'all' ? data : data.filter((r) => r.bias === bias)
  }, [query.data, filters, bias])

  const universe = query.data?.meta.universe_size

  return (
    <>
      <PageHeader
        title="Open Interest"
        description={`Açık pozisyon büyüklüğündeki değişim ve fiyatla ilişkisi${universe ? ` (hacme göre ilk ${universe} coin)` : ''}. OI artarken fiyatın yönü, yeni pozisyonların long mu short mu olduğunu gösterir. Değişimler ve pozisyonlanma seçilen zaman dilimine göre hesaplanır.`}
        generatedAt={query.data?.meta.generated_at}
        isFetching={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
      <Legend>
        {BIASES.map((b) => (
          <div key={b}>
            <Badge tone={BIAS_LABELS[b].tone}>{BIAS_LABELS[b].label}</Badge>
            <span>{BIAS_LABELS[b].description}</span>
          </div>
        ))}
      </Legend>
      <FilterBar>
        <IntervalControl value={period} options={OI_PERIODS} onChange={changePeriod} />
        <SearchInput value={search} onChange={setSearch} />
        <SelectField
          label="Pozisyonlanma"
          value={bias}
          onChange={setBias}
          options={[{ value: 'all', label: 'Tümü' }, ...BIASES.map((b) => ({ value: b, label: BIAS_LABELS[b].label }))]}
        />
      </FilterBar>
      <QueryState data={query.data} error={query.error} isPending={query.isPending} onRetry={() => void query.refetch()}>
        {(data) => (
          <>
            <PartialDataNotice meta={data.meta} />
            <DataTable
              caption="Open interest değişimleri"
              rows={rows}
              columns={columns}
              getRowKey={(r) => r.symbol}
              initialSort={{ columnId: 'oi_change', direction: 'desc' }}
            />
          </>
        )}
      </QueryState>
    </>
  )
}

