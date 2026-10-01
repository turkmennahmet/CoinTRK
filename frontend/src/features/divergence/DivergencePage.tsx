import { useMemo } from 'react'

import { useScanner } from '../../api/queries'
import type { Divergence, DivergenceType, ScannerInterval, ScannerRow } from '../../api/types'
import { DataTable, type Column } from '../../components/DataTable/DataTable'
import { Badge } from '../../components/ui/Badge'
import { Field, FilterBar, MinVolumeSelect, SearchInput, SelectField } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { PartialDataNotice, QueryState } from '../../components/ui/QueryState'
import { Segmented } from '../../components/ui/Segmented'
import { PctCell, RsiCell } from '../../components/ui/cells'
import { useUrlEnum, useUrlNumber } from '../../hooks/useUrlState'
import { applyMarketFilters } from '../../lib/filters'
import { formatNumber } from '../../lib/format'
import { SCANNER_INTERVALS, intervalLabel, spanLabel } from '../../lib/intervals'
import { change24hColumn, priceColumn, symbolColumn, volume24hColumn } from '../shared/columns'
import { IntervalControl } from '../shared/IntervalControl'
import { DIVERGENCE_LABELS } from '../shared/labels'
import { useMarketFilters, useScannerInterval } from '../shared/useMarketFilters'

type TypeFilter = DivergenceType | 'all'
/** Bullish setups must start at or below this RSI, bearish ones at or above 100 minus it. */
type ZoneFilter = 'any' | '40' | '30'

const TYPE_FILTERS: readonly TypeFilter[] = ['all', 'bullish', 'bearish']
const ZONE_FILTERS: readonly ZoneFilter[] = ['any', '40', '30']
const WITHIN_OPTIONS = [5, 10, 20, 50] as const

interface DivergenceRow extends ScannerRow {
  div: Divergence
}

function pivotPriceChange(d: Divergence): number | null {
  return d.price_first ? ((d.price_second - d.price_first) / d.price_first) * 100 : null
}

function inZone(d: Divergence, zone: ZoneFilter): boolean {
  if (zone === 'any') return true
  const limit = Number(zone)
  return d.type === 'bullish' ? d.rsi_first <= limit : d.rsi_first >= 100 - limit
}

function buildColumns(interval: ScannerInterval): Column<DivergenceRow>[] {
  return [
    symbolColumn(),
    {
      id: 'type',
      header: 'Uyumsuzluk',
      mobile: 'primary',
      cell: (r) => {
        const label = DIVERGENCE_LABELS[r.div.type]
        return (
          <Badge tone={label.tone} title={label.description}>
            {label.label}
          </Badge>
        )
      },
      sortValue: (r) => r.div.type,
      firstSortDirection: 'asc',
    },
    {
      id: 'bars_ago',
      header: 'Ne zaman',
      description: 'İkinci dip/tepenin kaç kapanmış mum önce oluştuğu',
      align: 'right',
      mobile: 'primary',
      cell: (r) => (
        <span className="num">
          {`${r.div.bars_ago} mum önce`}
          <span className="muted"> · {spanLabel(r.div.bars_ago, interval)}</span>
        </span>
      ),
      sortValue: (r) => r.div.bars_ago,
      firstSortDirection: 'asc',
    },
    {
      id: 'pivot_rsi',
      header: 'RSI dip/tepe',
      description: 'İki dip (pozitif) veya iki tepe (negatif) noktasındaki RSI değerleri',
      align: 'right',
      cell: (r) => (
        <span className="num">
          {formatNumber(r.div.rsi_first, 1)} → {formatNumber(r.div.rsi_second, 1)}
        </span>
      ),
      sortValue: (r) => r.div.rsi_second - r.div.rsi_first,
    },
    {
      id: 'pivot_price',
      header: 'Fiyat farkı',
      description: 'İkinci dip/tepenin fiyatının birinciye göre değişimi',
      align: 'right',
      cell: (r) => <PctCell value={pivotPriceChange(r.div)} />,
      sortValue: (r) => pivotPriceChange(r.div),
    },
    {
      id: 'span',
      header: 'Aralık',
      description: 'İki dip/tepe arasındaki mum sayısı',
      align: 'right',
      cell: (r) => (
        <span className="num">
          {r.div.span} mum<span className="muted"> · {spanLabel(r.div.span, interval)}</span>
        </span>
      ),
      sortValue: (r) => r.div.span,
    },
    {
      id: 'rsi',
      header: 'Güncel RSI',
      cell: (r) => <RsiCell value={r.rsi} />,
      sortValue: (r) => r.rsi,
    },
    priceColumn((r) => r.price),
    change24hColumn(),
    volume24hColumn(),
  ]
}

export default function DivergencePage() {
  const [interval, changeInterval] = useScannerInterval('4h')
  const [typeFilter, setTypeFilter] = useUrlEnum<TypeFilter>('type', 'all', TYPE_FILTERS)
  const [zone, setZone] = useUrlEnum<ZoneFilter>('zone', 'any', ZONE_FILTERS)
  const [within, setWithin] = useUrlNumber('within', 20, WITHIN_OPTIONS)
  const { search, setSearch, minVolume, setMinVolume, filters } = useMarketFilters()
  const query = useScanner(interval)

  const period = query.data?.params.rsi_period ?? 14
  const left = query.data?.params.pivot_left ?? 5
  const right = query.data?.params.pivot_right ?? 3
  const columns = useMemo(() => buildColumns(interval), [interval])

  const rows = useMemo<DivergenceRow[]>(() => {
    const out: DivergenceRow[] = []
    for (const row of applyMarketFilters(query.data?.rows ?? [], filters)) {
      for (const div of row.divergences) {
        if (div.bars_ago > within) continue
        if (typeFilter !== 'all' && div.type !== typeFilter) continue
        if (!inZone(div, zone)) continue
        out.push({ ...row, div })
      }
    }
    return out
  }, [query.data, filters, typeFilter, zone, within])

  return (
    <>
      <PageHeader
        title="RSI Uyumsuzluğu"
        description={`Kapanmış ${intervalLabel(interval)} mumlarda RSI(${period}) ile fiyat arasındaki klasik uyumsuzluklar. Dip ve tepeler RSI üzerinde aranır (solda ${left}, sağda ${right} mum), bu yüzden bir sinyal en erken ${right} mum sonra görünür. Fiyat sonradan ikinci dibin altında (tepenin üstünde) kapanırsa sinyal listeden düşer.`}
        generatedAt={query.data?.meta.generated_at}
        isFetching={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
      <FilterBar>
        <IntervalControl value={interval} options={SCANNER_INTERVALS} onChange={changeInterval} />
        <Field label="Tür">
          <Segmented
            ariaLabel="Uyumsuzluk türü"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: 'all', label: 'Tümü' },
              { value: 'bullish', label: 'Pozitif' },
              { value: 'bearish', label: 'Negatif' },
            ]}
          />
        </Field>
        <Field label="RSI bölgesi">
          <Segmented
            ariaLabel="İlk dip/tepenin RSI bölgesi"
            value={zone}
            onChange={setZone}
            options={[
              { value: 'any', label: 'Hepsi' },
              { value: '40', label: '≤40 / ≥60' },
              { value: '30', label: '≤30 / ≥70' },
            ]}
          />
        </Field>
        <SearchInput value={search} onChange={setSearch} />
        <MinVolumeSelect value={minVolume} onChange={setMinVolume} />
        <SelectField
          label="Son kaç mum"
          value={within}
          onChange={setWithin}
          options={WITHIN_OPTIONS.map((v) => ({ value: v, label: `${v} mum (${spanLabel(v, interval)})` }))}
        />
      </FilterBar>
      <QueryState data={query.data} error={query.error} isPending={query.isPending} onRetry={() => void query.refetch()}>
        {(data) => (
          <>
            <PartialDataNotice meta={data.meta} />
            <DataTable
              caption="RSI uyumsuzlukları"
              rows={rows}
              columns={columns}
              getRowKey={(r) => `${r.symbol}-${r.div.type}`}
              initialSort={{ columnId: 'bars_ago', direction: 'asc' }}
              emptyMessage={`Son ${within} mumda bu kriterlere uyan uyumsuzluk yok. Mum sayısını artırmayı veya RSI bölgesi filtresini gevşetmeyi deneyin.`}
            />
          </>
        )}
      </QueryState>
    </>
  )
}
