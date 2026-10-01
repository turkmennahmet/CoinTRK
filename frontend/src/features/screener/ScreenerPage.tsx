import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { useScanner } from '../../api/queries'
import type { AnomalyType, CrossType, DivergenceType, ScannerRow } from '../../api/types'
import { DataTable, type Column } from '../../components/DataTable/DataTable'
import { Badge } from '../../components/ui/Badge'
import { FilterBar, MinVolumeSelect, SearchInput, SelectField } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { PartialDataNotice, QueryState } from '../../components/ui/QueryState'
import { RangeFilter } from '../../components/ui/RangeSlider'
import { NumCell, RsiCell } from '../../components/ui/cells'
import { PERCENT_VALUES, useUrlEnum, useUrlNumber, useUrlRange } from '../../hooks/useUrlState'
import { applyMarketFilters } from '../../lib/filters'
import { formatMultiplier } from '../../lib/format'
import { SCANNER_INTERVALS, intervalLabel } from '../../lib/intervals'
import { change24hColumn, priceColumn, symbolColumn, volume24hColumn } from '../shared/columns'
import { emaPosition, type EmaPosition } from '../shared/ema'
import { IntervalControl } from '../shared/IntervalControl'
import { ANOMALY_LABELS, CROSS_LABELS, DIVERGENCE_LABELS } from '../shared/labels'
import { useMarketFilters, useScannerInterval } from '../shared/useMarketFilters'
import styles from './ScreenerPage.module.css'

/** Signals older than this many closed candles do not count. */
const RECENT_BARS = 10

type Any = 'any'
type Trend = 'up' | 'down'

const DIVERGENCES: readonly (DivergenceType | Any)[] = ['any', 'bullish', 'bearish']
const POSITIONS: readonly (EmaPosition | Any)[] = ['any', 'above', 'below', 'between']
const TRENDS: readonly (Trend | Any)[] = ['any', 'up', 'down']
const CROSSES: readonly (CrossType | Any)[] = ['any', 'golden', 'death']
const ANOMALIES: readonly (AnomalyType | Any)[] = ['any', ...(Object.keys(ANOMALY_LABELS) as AnomalyType[])]
const VOLUME_RATIOS = [0, 1.5, 2, 3, 5] as const

interface Criteria {
  rsiLow: number
  rsiHigh: number
  divergence: DivergenceType | Any
  position: EmaPosition | Any
  trend: Trend | Any
  cross: CrossType | Any
  anomaly: AnomalyType | Any
  minVolumeRatio: number
}

function recentDivergence(row: ScannerRow, type: DivergenceType) {
  return row.divergences.find((d) => d.type === type && d.bars_ago <= RECENT_BARS)
}

function matches(row: ScannerRow, c: Criteria): boolean {
  if (c.rsiLow > 0 || c.rsiHigh < 100) {
    if (row.rsi == null || row.rsi < c.rsiLow || row.rsi > c.rsiHigh) return false
  }
  if (c.divergence !== 'any' && !recentDivergence(row, c.divergence)) return false
  if (c.position !== 'any' && emaPosition(row) !== c.position) return false
  if (c.trend !== 'any') {
    const { ema_fast: fast, ema_slow: slow } = row.ma
    if (fast == null || slow == null || (c.trend === 'up') !== fast > slow) return false
  }
  if (c.cross !== 'any') {
    const cross = row.ma.ema_cross
    if (!cross || cross.type !== c.cross || cross.bars_ago >= RECENT_BARS) return false
  }
  if (c.anomaly !== 'any' && row.anomaly.type !== c.anomaly) return false
  if (c.minVolumeRatio > 0 && (row.volume.ratio ?? 0) < c.minVolumeRatio) return false
  return true
}

function activeCount(c: Criteria): number {
  return [
    c.rsiLow > 0 || c.rsiHigh < 100,
    c.divergence !== 'any',
    c.position !== 'any',
    c.trend !== 'any',
    c.cross !== 'any',
    c.anomaly !== 'any',
    c.minVolumeRatio > 0,
  ].filter(Boolean).length
}

/** Badges for every signal a row currently shows, so the reason for a match is visible. */
function Signals({ row }: { row: ScannerRow }) {
  const badges: { key: string; tone: 'up' | 'down' | 'warn' | 'info' | 'violet' | 'neutral'; label: string }[] = []
  for (const d of row.divergences) {
    if (d.bars_ago <= RECENT_BARS) {
      badges.push({ key: `div-${d.type}`, tone: DIVERGENCE_LABELS[d.type].tone, label: DIVERGENCE_LABELS[d.type].label })
    }
  }
  const cross = row.ma.ema_cross
  if (cross && cross.bars_ago < RECENT_BARS) {
    badges.push({ key: 'cross', tone: CROSS_LABELS[cross.type].tone, label: CROSS_LABELS[cross.type].label })
  }
  if (row.anomaly.type) {
    badges.push({ key: 'anomaly', tone: ANOMALY_LABELS[row.anomaly.type].tone, label: ANOMALY_LABELS[row.anomaly.type].label })
  }
  if (badges.length === 0) return <span className="muted">—</span>
  return (
    <span className={styles.signals}>
      {badges.map((b) => (
        <Badge key={b.key} tone={b.tone}>
          {b.label}
        </Badge>
      ))}
    </span>
  )
}

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
  {
    id: 'signals',
    header: 'Sinyaller',
    description: `Son ${RECENT_BARS} mumdaki uyumsuzluk ve EMA kesişimleri, son mumdaki fiyat/hacim anomalisi`,
    cell: (r) => <Signals row={r} />,
  },
  {
    id: 'trend',
    header: 'EMA Trendi',
    cell: (r) => {
      const { ema_fast: fast, ema_slow: slow } = r.ma
      if (fast == null || slow == null) return <span className="muted">—</span>
      return fast > slow ? <Badge tone="up">Yükseliş</Badge> : <Badge tone="down">Düşüş</Badge>
    },
  },
  {
    id: 'volume_ratio',
    header: 'Hacim ×',
    description: 'Son mum hacmi / ortalama',
    align: 'right',
    cell: (r) => <NumCell>{formatMultiplier(r.volume.ratio)}</NumCell>,
    sortValue: (r) => r.volume.ratio,
  },
  priceColumn((r) => r.price),
  change24hColumn(),
  volume24hColumn(),
]

export default function ScreenerPage() {
  const [, setSearchParams] = useSearchParams()
  const [interval, changeInterval] = useScannerInterval('4h')
  const [[rsiLow, rsiHigh], setRsiRange] = useUrlRange('rsiLo', 'rsiHi', [0, 100], PERCENT_VALUES)
  const [divergence, setDivergence] = useUrlEnum('div', 'any', DIVERGENCES)
  const [position, setPosition] = useUrlEnum('pos', 'any', POSITIONS)
  const [trend, setTrend] = useUrlEnum('trend', 'any', TRENDS)
  const [cross, setCross] = useUrlEnum('cross', 'any', CROSSES)
  const [anomaly, setAnomaly] = useUrlEnum('anomaly', 'any', ANOMALIES)
  const [minVolumeRatio, setMinVolumeRatio] = useUrlNumber('volX', 0, VOLUME_RATIOS)
  const { search, setSearch, minVolume, setMinVolume, filters } = useMarketFilters()
  const query = useScanner(interval)

  const fastLen = query.data?.params.ma_fast ?? 50
  const slowLen = query.data?.params.ma_slow ?? 200
  const criteria = useMemo<Criteria>(
    () => ({ rsiLow, rsiHigh, divergence, position, trend, cross, anomaly, minVolumeRatio }),
    [rsiLow, rsiHigh, divergence, position, trend, cross, anomaly, minVolumeRatio],
  )
  const active = activeCount(criteria)

  const rows = useMemo(
    () => applyMarketFilters(query.data?.rows ?? [], filters).filter((r) => matches(r, criteria)),
    [query.data, filters, criteria],
  )

  return (
    <>
      <PageHeader
        title="Birleşik Filtre"
        description={`Birden fazla koşulu aynı anda uygulayın; listede sadece hepsini sağlayan coinler kalır. Kapanmış ${intervalLabel(interval)} mumlar kullanılır, uyumsuzluk ve kesişimler için son ${RECENT_BARS} mum sayılır.`}
        generatedAt={query.data?.meta.generated_at}
        isFetching={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
      <FilterBar>
        <IntervalControl value={interval} options={SCANNER_INTERVALS} onChange={changeInterval} />
        <RangeFilter label="RSI aralığı" min={0} max={100} low={rsiLow} high={rsiHigh} onApply={setRsiRange} />
        <SelectField
          label="RSI uyumsuzluğu"
          value={divergence}
          onChange={setDivergence}
          options={[
            { value: 'any', label: 'Fark etmez' },
            { value: 'bullish', label: 'Pozitif' },
            { value: 'bearish', label: 'Negatif' },
          ]}
        />
        <SelectField
          label="Fiyat / EMA"
          value={position}
          onChange={setPosition}
          options={[
            { value: 'any', label: 'Fark etmez' },
            { value: 'above', label: `EMA${fastLen} ve EMA${slowLen} üstünde` },
            { value: 'below', label: `EMA${fastLen} ve EMA${slowLen} altında` },
            { value: 'between', label: 'İki EMA arasında' },
          ]}
        />
        <SelectField
          label="EMA trendi"
          value={trend}
          onChange={setTrend}
          options={[
            { value: 'any', label: 'Fark etmez' },
            { value: 'up', label: `Yükseliş (EMA${fastLen} > EMA${slowLen})` },
            { value: 'down', label: `Düşüş (EMA${fastLen} < EMA${slowLen})` },
          ]}
        />
        <SelectField
          label="EMA kesişimi"
          value={cross}
          onChange={setCross}
          options={[
            { value: 'any', label: 'Fark etmez' },
            { value: 'golden', label: 'Golden cross' },
            { value: 'death', label: 'Death cross' },
          ]}
        />
        <SelectField
          label="Fiyat/hacim"
          value={anomaly}
          onChange={setAnomaly}
          options={ANOMALIES.map((a) => ({ value: a, label: a === 'any' ? 'Fark etmez' : ANOMALY_LABELS[a].label }))}
        />
        <SelectField
          label="Son mum hacmi"
          value={minVolumeRatio}
          onChange={setMinVolumeRatio}
          options={VOLUME_RATIOS.map((v) => ({ value: v, label: v === 0 ? 'Fark etmez' : `≥ ${formatMultiplier(v)} ortalama` }))}
        />
        <SearchInput value={search} onChange={setSearch} />
        <MinVolumeSelect value={minVolume} onChange={setMinVolume} />
      </FilterBar>
      <div className={styles.summary}>
        <span>
          {active === 0 ? 'Koşul seçilmedi' : `${active} koşul`} ·{' '}
          <strong className="num">{query.data ? rows.length : '—'}</strong> coin eşleşti
        </span>
        {active > 0 && (
          <button
            type="button"
            className={styles.reset}
            onClick={() => setSearchParams(interval === '4h' ? {} : { tf: interval }, { replace: true })}
          >
            Koşulları sıfırla
          </button>
        )}
      </div>
      <QueryState data={query.data} error={query.error} isPending={query.isPending} onRetry={() => void query.refetch()}>
        {(data) => (
          <>
            <PartialDataNotice meta={data.meta} />
            <DataTable
              caption="Birleşik filtre sonuçları"
              rows={rows}
              columns={COLUMNS}
              getRowKey={(r) => r.symbol}
              initialSort={{ columnId: 'volume_24h', direction: 'desc' }}
              emptyMessage="Bütün koşulları aynı anda sağlayan coin yok. Bir koşulu gevşetmeyi veya başka bir zaman dilimi seçmeyi deneyin."
            />
          </>
        )}
      </QueryState>
    </>
  )
}
