import { useMemo } from 'react'

import { useScanner } from '../../api/queries'
import type { Cross, CrossType, ScannerInterval, ScannerRow } from '../../api/types'
import { DataTable, type Column } from '../../components/DataTable/DataTable'
import { Badge } from '../../components/ui/Badge'
import { Field, FilterBar, MinVolumeSelect, SearchInput, SelectField } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { PartialDataNotice, QueryState } from '../../components/ui/QueryState'
import { Segmented } from '../../components/ui/Segmented'
import { NumCell, PctCell } from '../../components/ui/cells'
import { useUrlEnum, useUrlNumber } from '../../hooks/useUrlState'
import { applyMarketFilters } from '../../lib/filters'
import { formatPrice } from '../../lib/format'
import { SCANNER_INTERVALS, spanLabel } from '../../lib/intervals'
import { change24hColumn, priceColumn, symbolColumn, volume24hColumn } from '../shared/columns'
import { IntervalControl } from '../shared/IntervalControl'
import { CROSS_LABELS } from '../shared/labels'
import { useMarketFilters, useScannerInterval } from '../shared/useMarketFilters'

type MaKind = 'sma' | 'ema'
type CrossFilter = CrossType | 'all'

const MA_KINDS: readonly MaKind[] = ['sma', 'ema']
const CROSS_FILTERS: readonly CrossFilter[] = ['golden', 'death', 'all']
const WITHIN_OPTIONS = [3, 5, 10, 20, 50] as const

interface CrossRow extends ScannerRow {
  cross: Cross
  fast: number | null
  slow: number | null
}

function buildColumns(kind: MaKind, fastLen: number, slowLen: number, interval: ScannerInterval): Column<CrossRow>[] {
  const prefix = kind.toUpperCase()
  return [
    symbolColumn(),
    {
      id: 'cross',
      header: 'Kesişim',
      mobile: 'primary',
      cell: (r) => <Badge tone={CROSS_LABELS[r.cross.type].tone}>{CROSS_LABELS[r.cross.type].label}</Badge>,
      sortValue: (r) => r.cross.type,
      firstSortDirection: 'asc',
    },
    {
      id: 'bars_ago',
      header: 'Ne zaman',
      description: 'Kesişimin kaç kapanmış mum önce gerçekleştiği',
      align: 'right',
      mobile: 'primary',
      cell: (r) => (
        <span className="num">
          {r.cross.bars_ago === 0 ? 'Son mum' : `${r.cross.bars_ago} mum önce`}
          <span className="muted"> · {spanLabel(r.cross.bars_ago + 1, interval)}</span>
        </span>
      ),
      sortValue: (r) => r.cross.bars_ago,
      firstSortDirection: 'asc',
    },
    priceColumn((r) => r.price),
    {
      id: 'vs_slow',
      header: `Fiyat / ${prefix}${slowLen}`,
      description: `Fiyatın ${prefix}${slowLen} ortalamasına göre uzaklığı`,
      align: 'right',
      cell: (r) => <PctCell value={distancePct(r.price, r.slow)} />,
      sortValue: (r) => distancePct(r.price, r.slow),
    },
    {
      id: 'fast',
      header: `${prefix}${fastLen}`,
      align: 'right',
      cell: (r) => <NumCell>{formatPrice(r.fast)}</NumCell>,
    },
    {
      id: 'slow',
      header: `${prefix}${slowLen}`,
      align: 'right',
      cell: (r) => <NumCell>{formatPrice(r.slow)}</NumCell>,
    },
    change24hColumn(),
    volume24hColumn(),
  ]
}

function distancePct(price: number, ma: number | null): number | null {
  return ma ? ((price - ma) / ma) * 100 : null
}

export default function CrossPage() {
  const [interval, changeInterval] = useScannerInterval('1d')
  const [kind, setKind] = useUrlEnum<MaKind>('ma', 'ema', MA_KINDS)
  const [crossFilter, setCrossFilter] = useUrlEnum<CrossFilter>('type', 'golden', CROSS_FILTERS)
  const [within, setWithin] = useUrlNumber('within', 20, WITHIN_OPTIONS)
  const { search, setSearch, minVolume, setMinVolume, filters } = useMarketFilters()
  const query = useScanner(interval)

  const fastLen = query.data?.params.ma_fast ?? 50
  const slowLen = query.data?.params.ma_slow ?? 200
  const columns = useMemo(() => buildColumns(kind, fastLen, slowLen, interval), [kind, fastLen, slowLen, interval])

  const rows = useMemo<CrossRow[]>(() => {
    const out: CrossRow[] = []
    for (const row of applyMarketFilters(query.data?.rows ?? [], filters)) {
      const cross = kind === 'sma' ? row.ma.sma_cross : row.ma.ema_cross
      if (!cross || cross.bars_ago >= within) continue
      if (crossFilter !== 'all' && cross.type !== crossFilter) continue
      const fast = kind === 'sma' ? row.ma.sma_fast : row.ma.ema_fast
      const slow = kind === 'sma' ? row.ma.sma_slow : row.ma.ema_slow
      out.push({ ...row, cross, fast, slow })
    }
    return out
  }, [query.data, filters, kind, crossFilter, within])

  return (
    <>
      <PageHeader
        title="Golden / Death Cross"
        description={`${fastLen} periyotluk ortalamanın ${slowLen} periyotluk ortalamayı kestiği coinler. Varsayılan olarak EMA kullanılır; klasik golden cross için SMA seçilebilir. ${slowLen} mumdan kısa geçmişi olan yeni coinler listede yer almaz.`}
        generatedAt={query.data?.meta.generated_at}
        isFetching={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
      <FilterBar>
        <IntervalControl value={interval} options={SCANNER_INTERVALS} onChange={changeInterval} />
        <Field label="Ortalama">
          <Segmented
            ariaLabel="Ortalama türü"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'sma', label: 'SMA' },
              { value: 'ema', label: 'EMA' },
            ]}
          />
        </Field>
        <Field label="Kesişim">
          <Segmented
            ariaLabel="Kesişim türü"
            value={crossFilter}
            onChange={setCrossFilter}
            options={[
              { value: 'golden', label: 'Golden' },
              { value: 'death', label: 'Death' },
              { value: 'all', label: 'Tümü' },
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
              caption="Hareketli ortalama kesişimleri"
              rows={rows}
              columns={columns}
              getRowKey={(r) => r.symbol}
              initialSort={{ columnId: 'bars_ago', direction: 'asc' }}
              emptyMessage={`Son ${within} mumda bu kriterlere uyan kesişim yok. Mum sayısını artırmayı deneyin.`}
            />
          </>
        )}
      </QueryState>
    </>
  )
}

