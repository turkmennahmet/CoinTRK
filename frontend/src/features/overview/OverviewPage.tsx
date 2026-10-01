import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { useFunding, useOpenInterest, useScanner } from '../../api/queries'
import type { ScannerRow } from '../../api/types'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { ErrorState, Skeleton } from '../../components/ui/QueryState'
import { PctCell, RSI_OVERBOUGHT, RSI_OVERSOLD, RsiCell, SymbolCell } from '../../components/ui/cells'
import { formatMultiplier, formatNumber, formatUsdCompact } from '../../lib/format'
import { intervalLabel, spanLabel } from '../../lib/intervals'
import { ANOMALY_LABELS, CROSS_LABELS } from '../shared/labels'
import styles from './OverviewPage.module.css'
import { oiChange } from '../open-interest/changes'
import { computeBreadth, isLiquid, liquidFunding, liquidOI, OVERVIEW_MIN_VOLUME, topBy } from './summary'

const INTERVAL = '1d'
const OI_PERIOD = '1d'
const RECENT_CROSS_BARS = 12

export default function OverviewPage() {
  const scanner = useScanner(INTERVAL)
  const funding = useFunding()
  const oi = useOpenInterest(OI_PERIOD)

  const scannerRows = scanner.data?.rows ?? []
  const liquid = scannerRows.filter(isLiquid)

  const refresh = () => {
    void scanner.refetch()
    void funding.refetch()
    void oi.refetch()
  }

  return (
    <>
      <PageHeader
        title="Ana Sayfa"
        description={`Binance USDT perpetual piyasasında şu an öne çıkanlar. Listeler günlük mumlara göre hesaplanır ve 24 saatlik hacmi ${formatUsdCompact(OVERVIEW_MIN_VOLUME)} altındaki coinleri içermez.`}
        generatedAt={scanner.data?.meta.generated_at}
        isFetching={scanner.isFetching || funding.isFetching || oi.isFetching}
        onRefresh={refresh}
      />

      {scanner.error && !scanner.data ? (
        <ErrorState error={scanner.error} onRetry={() => void scanner.refetch()} />
      ) : (
        <>
          <Breadth rows={scannerRows} loading={scanner.isPending} />

          <div className={styles.grid}>
            <Card title="Hacim Patlaması" subtitle="Son 3 gün, ortalamaya göre" to={`/hacim?tf=${INTERVAL}`} loading={scanner.isPending}>
              {topBy(liquid, (r) => r.volume.window_ratio, 'desc').map((r) => (
                <Item key={r.symbol} row={r}>
                  <span className="num" style={{ color: 'var(--warn)', fontWeight: 600 }}>
                    {formatMultiplier(r.volume.window_ratio)}
                  </span>
                </Item>
              ))}
            </Card>

            <Card title="Fiyat/Hacim" subtitle="En güçlü fiyat/hacim sapmaları" to={`/fiyat-hacim?tf=${INTERVAL}`} loading={scanner.isPending}>
              {topBy(liquid, (r) => r.anomaly.score, 'desc', 5, (r) => r.anomaly.type !== null).map((r) => (
                <Item key={r.symbol} row={r}>
                  <Badge tone={ANOMALY_LABELS[r.anomaly.type!].tone}>{ANOMALY_LABELS[r.anomaly.type!].label}</Badge>
                  <PctCell value={r.anomaly.candle_return_pct} />
                </Item>
              ))}
            </Card>

            <Card
              title="Yeni Kesişimler"
              subtitle={`EMA 50/200, son ${RECENT_CROSS_BARS} gün`}
              to={`/golden-cross?tf=${INTERVAL}&ma=ema&type=all&within=20`}
              loading={scanner.isPending}
            >
              {topBy(
                liquid,
                (r) => r.ma.ema_cross?.bars_ago,
                'asc',
                5,
                (r) => r.ma.ema_cross != null && r.ma.ema_cross.bars_ago < RECENT_CROSS_BARS,
              ).map((r) => (
                <Item key={r.symbol} row={r}>
                  <Badge tone={CROSS_LABELS[r.ma.ema_cross!.type].tone}>{CROSS_LABELS[r.ma.ema_cross!.type].label}</Badge>
                  <span className="num muted">{spanLabel(r.ma.ema_cross!.bars_ago + 1, INTERVAL)}</span>
                </Item>
              ))}
            </Card>

            <Card title="Aşırı Satım" subtitle={`En düşük RSI (≤${RSI_OVERSOLD} bölgesi)`} to={`/rsi?tf=${INTERVAL}&lo=0&hi=30`} loading={scanner.isPending}>
              {topBy(liquid, (r) => r.rsi, 'asc').map((r) => (
                <Item key={r.symbol} row={r}>
                  <RsiCell value={r.rsi} />
                </Item>
              ))}
            </Card>

            <Card title="Aşırı Alım" subtitle={`En yüksek RSI (≥${RSI_OVERBOUGHT} bölgesi)`} to={`/rsi?tf=${INTERVAL}&lo=70&hi=100`} loading={scanner.isPending}>
              {topBy(liquid, (r) => r.rsi, 'desc').map((r) => (
                <Item key={r.symbol} row={r}>
                  <RsiCell value={r.rsi} />
                </Item>
              ))}
            </Card>

            <Card title="OI En Çok Artan" subtitle="Son 24 saat" to={`/open-interest?tf=${OI_PERIOD}`} loading={oi.isPending} error={oi.error}>
              {topBy(
                liquidOI(oi.data?.rows ?? [], scannerRows),
                (r) => oiChange(r, OI_PERIOD),
                'desc',
              ).map((r) => (
                <Item key={r.symbol} symbol={r.symbol} base={r.base_asset}>
                  <PctCell value={oiChange(r, OI_PERIOD)} />
                  <span className="muted num">{formatUsdCompact(r.open_interest_usd)}</span>
                </Item>
              ))}
            </Card>

            <Card title="En Negatif Funding" subtitle="Kalabalık short" to="/funding?sign=negative" loading={funding.isPending} error={funding.error}>
              {topBy(liquidFunding(funding.data?.rows ?? []), (r) => r.funding_rate_pct, 'asc', 5, (r) => r.funding_rate_pct < 0).map(
                (r) => (
                  <Item key={r.symbol} symbol={r.symbol} base={r.base_asset}>
                    <PctCell value={r.funding_rate_pct} digits={4} />
                  </Item>
                ),
              )}
            </Card>

            <Card title="En Pozitif Funding" subtitle="Kalabalık long" to="/funding?sign=positive" loading={funding.isPending} error={funding.error}>
              {topBy(liquidFunding(funding.data?.rows ?? []), (r) => r.funding_rate_pct, 'desc', 5, (r) => r.funding_rate_pct > 0).map(
                (r) => (
                  <Item key={r.symbol} symbol={r.symbol} base={r.base_asset}>
                    <PctCell value={r.funding_rate_pct} digits={4} />
                  </Item>
                ),
              )}
            </Card>
          </div>
        </>
      )}
    </>
  )
}

function Breadth({ rows, loading }: { rows: readonly ScannerRow[]; loading: boolean }) {
  const b = computeBreadth(rows)
  const pctAbove = b.withSlowEma ? (b.aboveSlowEma / b.withSlowEma) * 100 : null
  const pctUp = b.total ? (b.advancers / b.total) * 100 : null

  const stats: { label: string; value: ReactNode; hint: string }[] = [
    {
      label: '24s yükselen / düşen',
      value: (
        <>
          <span className="up">{b.advancers}</span>
          <span className="muted"> / </span>
          <span className="down">{b.decliners}</span>
        </>
      ),
      hint: pctUp != null ? `Coinlerin %${formatNumber(pctUp, 0)}'i yükselişte` : '',
    },
    {
      label: `EMA200 üstünde (${intervalLabel(INTERVAL)})`,
      value: pctAbove != null ? `%${formatNumber(pctAbove, 0)}` : '—',
      hint: `${b.aboveSlowEma} / ${b.withSlowEma} coin`,
    },
    {
      label: `Medyan RSI (${intervalLabel(INTERVAL)})`,
      value: formatNumber(b.medianRsi, 1),
      hint: b.medianRsi == null ? '' : b.medianRsi >= 60 ? 'Piyasa ısınmış' : b.medianRsi <= 40 ? 'Piyasa zayıf' : 'Nötr bölge',
    },
    {
      label: 'Toplam 24s hacim',
      value: formatUsdCompact(b.totalVolume),
      hint: `Hacme göre ilk ${b.total} coin`,
    },
  ]

  if (loading) return <Skeleton rows={1} />

  return (
    <section className={styles.breadth} aria-label="Piyasa genişliği">
      {stats.map((s) => (
        <div key={s.label} className={styles.stat}>
          <span className={styles.statLabel}>{s.label}</span>
          <span className={`${styles.statValue} num`}>{s.value}</span>
          <span className={styles.statHint}>{s.hint}</span>
        </div>
      ))}
    </section>
  )
}

function Card({
  title,
  subtitle,
  to,
  loading,
  error,
  children,
}: {
  title: string
  subtitle: string
  to: string
  loading: boolean
  error?: Error | null
  children: ReactNode[]
}) {
  const empty = !loading && !error && children.length === 0
  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <Link to={to} className={styles.cardLink}>
          Tümü →
        </Link>
      </header>
      {loading ? (
        <Skeleton rows={5} />
      ) : error ? (
        <p className={styles.cardEmpty}>Veri alınamadı.</p>
      ) : empty ? (
        <p className={styles.cardEmpty}>Şu an öne çıkan coin yok.</p>
      ) : (
        <ol className={styles.list}>{children}</ol>
      )}
    </section>
  )
}

type ItemProps = { children: ReactNode } & ({ row: ScannerRow } | { symbol: string; base: string })

function Item(props: ItemProps) {
  const symbol = 'row' in props ? props.row.symbol : props.symbol
  const base = 'row' in props ? props.row.base_asset : props.base
  return (
    <li className={styles.item}>
      <SymbolCell symbol={symbol} base={base} />
      <span className={styles.itemValue}>{props.children}</span>
    </li>
  )
}
