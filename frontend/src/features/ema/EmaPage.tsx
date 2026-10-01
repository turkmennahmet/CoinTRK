import { useMemo } from 'react'

import { useScanner } from '../../api/queries'
import type { ScannerRow } from '../../api/types'
import { DataTable, type Column } from '../../components/DataTable/DataTable'
import { Badge } from '../../components/ui/Badge'
import { Field, FilterBar, MinVolumeSelect, SearchInput } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { PartialDataNotice, QueryState } from '../../components/ui/QueryState'
import { Segmented } from '../../components/ui/Segmented'
import { NumCell, PctCell, RsiCell } from '../../components/ui/cells'
import { useUrlEnum } from '../../hooks/useUrlState'
import { applyMarketFilters } from '../../lib/filters'
import { formatPrice } from '../../lib/format'
import { SCANNER_INTERVALS, intervalLabel } from '../../lib/intervals'
import { change24hColumn, priceColumn, symbolColumn, volume24hColumn } from '../shared/columns'
import { IntervalControl } from '../shared/IntervalControl'
import { distancePct, emaPosition, type EmaPosition } from '../shared/ema'
import { useMarketFilters, useScannerInterval } from '../shared/useMarketFilters'

type Position = EmaPosition | 'all'
const POSITIONS: readonly Position[] = ['above', 'below', 'between', 'all']

function buildColumns(fastLen: number, slowLen: number): Column<ScannerRow>[] {
  return [
    symbolColumn(),
    priceColumn((r) => r.price),
    {
      id: 'vs_fast',
      header: `Fiyat / EMA${fastLen}`,
      description: `Fiyatın EMA${fastLen} ortalamasına göre uzaklığı`,
      align: 'right',
      mobile: 'primary',
      cell: (r) => <PctCell value={distancePct(r.price, r.ma.ema_fast)} />,
      sortValue: (r) => distancePct(r.price, r.ma.ema_fast),
    },
    {
      id: 'vs_slow',
      header: `Fiyat / EMA${slowLen}`,
      description: `Fiyatın EMA${slowLen} ortalamasına göre uzaklığı`,
      align: 'right',
      mobile: 'primary',
      cell: (r) => <PctCell value={distancePct(r.price, r.ma.ema_slow)} />,
      sortValue: (r) => distancePct(r.price, r.ma.ema_slow),
    },
    {
      id: 'trend',
      header: 'Trend',
      description: `EMA${fastLen}, EMA${slowLen} ortalamasının üstündeyse yükseliş, altındaysa düşüş`,
      cell: (r) => {
        const { ema_fast: fast, ema_slow: slow } = r.ma
        if (fast == null || slow == null) return <span className="muted">—</span>
        return fast > slow ? <Badge tone="up">Yükseliş</Badge> : <Badge tone="down">Düşüş</Badge>
      },
      sortValue: (r) => (r.ma.ema_fast == null ? null : distancePct(r.ma.ema_fast, r.ma.ema_slow)),
    },
    {
      id: 'fast',
      header: `EMA${fastLen}`,
      align: 'right',
      cell: (r) => <NumCell>{formatPrice(r.ma.ema_fast)}</NumCell>,
    },
    {
      id: 'slow',
      header: `EMA${slowLen}`,
      align: 'right',
      cell: (r) => <NumCell>{formatPrice(r.ma.ema_slow)}</NumCell>,
    },
    {
      id: 'rsi',
      header: 'RSI',
      cell: (r) => <RsiCell value={r.rsi} />,
      sortValue: (r) => r.rsi,
    },
    change24hColumn(),
    volume24hColumn(),
  ]
}

export default function EmaPage() {
  const [interval, changeInterval] = useScannerInterval('4h')
  const [position, setPosition] = useUrlEnum<Position>('pos', 'above', POSITIONS)
  const { search, setSearch, minVolume, setMinVolume, filters } = useMarketFilters()
  const query = useScanner(interval)

  const fastLen = query.data?.params.ma_fast ?? 50
  const slowLen = query.data?.params.ma_slow ?? 200
  const columns = useMemo(() => buildColumns(fastLen, slowLen), [fastLen, slowLen])

  const rows = useMemo(
    () =>
      applyMarketFilters(query.data?.rows ?? [], filters).filter(
        (r) => position === 'all' || emaPosition(r) === position,
      ),
    [query.data, filters, position],
  )

  return (
    <>
      <PageHeader
        title="EMA Tarayıcı"
        description={`Kapanmış ${intervalLabel(interval)} mumlarda fiyatın EMA${fastLen} ve EMA${slowLen} ortalamalarına göre konumu. ${slowLen} mumdan kısa geçmişi olan coinler konum filtrelerinde yer almaz.`}
        generatedAt={query.data?.meta.generated_at}
        isFetching={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
      <FilterBar>
        <IntervalControl value={interval} options={SCANNER_INTERVALS} onChange={changeInterval} />
        <Field label="Fiyat konumu">
          <Segmented
            ariaLabel="Fiyatın EMA'lara göre konumu"
            value={position}
            onChange={setPosition}
            options={[
              { value: 'above', label: 'İkisinin üstünde' },
              { value: 'below', label: 'İkisinin altında' },
              { value: 'between', label: 'Arasında' },
              { value: 'all', label: 'Tümü' },
            ]}
          />
        </Field>
        <SearchInput value={search} onChange={setSearch} />
        <MinVolumeSelect value={minVolume} onChange={setMinVolume} />
      </FilterBar>
      <QueryState data={query.data} error={query.error} isPending={query.isPending} onRetry={() => void query.refetch()}>
        {(data) => (
          <>
            <PartialDataNotice meta={data.meta} />
            <DataTable
              caption="Fiyatın EMA'lara göre konumu"
              rows={rows}
              columns={columns}
              getRowKey={(r) => r.symbol}
              initialSort={{ columnId: 'vs_slow', direction: 'desc' }}
              emptyMessage="Bu kriterlere uyan coin yok."
            />
          </>
        )}
      </QueryState>
    </>
  )
}
