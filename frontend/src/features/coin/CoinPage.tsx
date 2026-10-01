import type { ReactNode } from 'react'
import { useParams } from 'react-router'

import { useCoin } from '../../api/queries'
import type { CoinDetailResponse, ScannerRow } from '../../api/types'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { QueryState } from '../../components/ui/QueryState'
import { LongShortBar, PctCell, RsiCell } from '../../components/ui/cells'
import { useNow } from '../../hooks/useNow'
import { formatCountdown, formatMultiplier, formatPct, formatPrice, formatUsdCompact } from '../../lib/format'
import { OI_PERIODS, intervalLabel } from '../../lib/intervals'
import { tradingViewUrl } from '../../lib/links'
import { oiChange } from '../open-interest/changes'
import { distancePct } from '../shared/ema'
import { ANOMALY_LABELS, BIAS_LABELS, CROSS_LABELS, DIVERGENCE_LABELS } from '../shared/labels'
import styles from './CoinPage.module.css'

interface MatrixRow {
  label: string
  hint?: string
  cell: (m: ScannerRow) => ReactNode
}

const DASH = <span className="muted">—</span>

function barsAgo(bars: number): string {
  return bars === 0 ? 'son mum' : `${bars} mum önce`
}

function matrixRows(data: CoinDetailResponse): MatrixRow[] {
  const { ma_fast: fast, ma_slow: slow, divergence_lookback: lookback } = data.params
  return [
    { label: 'RSI', hint: `Wilder RSI(${data.params.rsi_period})`, cell: (m) => <RsiCell value={m.rsi} /> },
    {
      label: `Fiyat / EMA${fast}`,
      cell: (m) => <PctCell value={distancePct(m.price, m.ma.ema_fast)} />,
    },
    {
      label: `Fiyat / EMA${slow}`,
      cell: (m) => (m.ma.ema_slow == null ? DASH : <PctCell value={distancePct(m.price, m.ma.ema_slow)} />),
    },
    {
      label: 'EMA trendi',
      hint: `EMA${fast} ile EMA${slow} karşılaştırması`,
      cell: (m) => {
        if (m.ma.ema_fast == null || m.ma.ema_slow == null) return DASH
        return m.ma.ema_fast > m.ma.ema_slow ? <Badge tone="up">Yükseliş</Badge> : <Badge tone="down">Düşüş</Badge>
      },
    },
    {
      label: 'Son EMA kesişimi',
      hint: `Son ${data.params.cross_lookback} mum içinde`,
      cell: (m) =>
        m.ma.ema_cross ? (
          <span className={styles.stack}>
            <Badge tone={CROSS_LABELS[m.ma.ema_cross.type].tone}>{CROSS_LABELS[m.ma.ema_cross.type].label}</Badge>
            <span className="muted">{barsAgo(m.ma.ema_cross.bars_ago)}</span>
          </span>
        ) : (
          DASH
        ),
    },
    {
      label: 'RSI uyumsuzluğu',
      hint: `Son ${lookback} mum içinde`,
      cell: (m) =>
        m.divergences.length ? (
          <span className={styles.stack}>
            {m.divergences.map((d) => (
              <span key={d.type} className={styles.stack}>
                <Badge tone={DIVERGENCE_LABELS[d.type].tone} title={DIVERGENCE_LABELS[d.type].description}>
                  {d.type === 'bullish' ? 'Pozitif' : 'Negatif'}
                </Badge>
                <span className="muted">{barsAgo(d.bars_ago)}</span>
              </span>
            ))}
          </span>
        ) : (
          DASH
        ),
    },
    {
      label: 'Son mum hacmi',
      hint: 'Ortalamaya göre kat',
      cell: (m) => <span className="num">{formatMultiplier(m.volume.ratio)}</span>,
    },
    {
      label: 'Fiyat/hacim',
      cell: (m) =>
        m.anomaly.type ? (
          <Badge tone={ANOMALY_LABELS[m.anomaly.type].tone} title={ANOMALY_LABELS[m.anomaly.type].description}>
            {ANOMALY_LABELS[m.anomaly.type].label}
          </Badge>
        ) : (
          DASH
        ),
    },
  ]
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} num`}>{value}</span>
      {hint && <span className={styles.statHint}>{hint}</span>}
    </div>
  )
}

function Summary({ data }: { data: CoinDetailResponse }) {
  const now = useNow(30_000)
  const { funding, open_interest: oi } = data
  return (
    <div className={styles.stats}>
      <Stat label="Fiyat" value={formatPrice(data.price)} hint={<PctCell value={data.change_24h_pct} />} />
      <Stat label="24s Hacim" value={formatUsdCompact(data.quote_volume_24h)} />
      <Stat
        label="Funding"
        value={funding ? <PctCell value={funding.funding_rate_pct} digits={4} /> : '—'}
        hint={
          funding
            ? `${funding.interval_hours} saatte bir · yıllık ${formatPct(funding.apr_pct, 1)} · ${formatCountdown(funding.next_funding_time, now)} sonra`
            : undefined
        }
      />
      <Stat
        label="Open Interest"
        value={oi ? formatUsdCompact(oi.open_interest_usd) : '—'}
        hint={oi ? <>4s: <PctCell value={oiChange(oi, '4h')} /></> : undefined}
      />
    </div>
  )
}

function Timeframes({ data }: { data: CoinDetailResponse }) {
  const rows = matrixRows(data)
  return (
    <section className={styles.section}>
      <h2>Zaman Dilimleri</h2>
      <div className={styles.matrixScroll}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Gösterge</span>
              </th>
              {data.timeframes.map((t) => (
                <th key={t.interval} scope="col">
                  {intervalLabel(t.interval)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">
                  {row.label}
                  {row.hint && <span className={styles.rowHint}>{row.hint}</span>}
                </th>
                {data.timeframes.map((t) => (
                  <td key={t.interval}>{t.metrics ? row.cell(t.metrics) : <span className="muted">Yetersiz geçmiş</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Positioning({ data }: { data: CoinDetailResponse }) {
  const oi = data.open_interest
  if (!oi) {
    return (
      <section className={styles.section}>
        <h2>Pozisyonlanma</h2>
        <p className="muted">Bu coin için open interest verisi alınamadı.</p>
      </section>
    )
  }
  const bias = oi.bias ? BIAS_LABELS[oi.bias] : null
  return (
    <section className={styles.section}>
      <h2>Pozisyonlanma</h2>
      <div className={styles.positioning}>
        <div className={styles.panel}>
          <span className={styles.statLabel}>Open interest değişimi</span>
          <div className={styles.chips}>
            {OI_PERIODS.map((w) => (
              <span key={w} className={styles.chip}>
                <span className="muted">{intervalLabel(w)}</span>
                <PctCell value={oiChange(oi, w)} />
              </span>
            ))}
          </div>
          <div className={styles.bias}>
            <span className="muted">Son 4 saat:</span>
            {bias ? (
              <Badge tone={bias.tone} title={bias.description}>
                {bias.label}
              </Badge>
            ) : (
              <span className="muted">Nötr</span>
            )}
          </div>
        </div>
        <div className={styles.panel}>
          <span className={styles.statLabel}>Long / Short · Tüm Hesaplar</span>
          {oi.accounts_ratio ? (
            <LongShortBar
              longPct={oi.accounts_ratio.long_pct}
              shortPct={oi.accounts_ratio.short_pct}
              ratio={oi.accounts_ratio.ratio}
              wide
            />
          ) : (
            DASH
          )}
          <span className={styles.statLabel}>Long / Short · Büyük Trader</span>
          {oi.top_traders_ratio ? (
            <LongShortBar
              longPct={oi.top_traders_ratio.long_pct}
              shortPct={oi.top_traders_ratio.short_pct}
              ratio={oi.top_traders_ratio.ratio}
              wide
            />
          ) : (
            DASH
          )}
        </div>
      </div>
    </section>
  )
}

export default function CoinPage() {
  const { symbol = '' } = useParams()
  const upper = symbol.toUpperCase()
  const query = useCoin(upper)
  const data = query.data

  return (
    <>
      <PageHeader
        title={data ? `${data.base_asset} / USDT` : upper}
        description={
          <>
            Bu coinin bütün sinyalleri tek ekranda: her zaman diliminde kapanmış mumlardan hesaplanan göstergeler,
            funding ve pozisyonlanma.{' '}
            <a className={styles.external} href={tradingViewUrl(upper)} target="_blank" rel="noopener noreferrer">
              TradingView'da aç ↗
            </a>
          </>
        }
        generatedAt={data?.generated_at}
        isFetching={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
      <QueryState data={data} error={query.error} isPending={query.isPending} onRetry={() => void query.refetch()}>
        {(d) => (
          <>
            <Summary data={d} />
            <Timeframes data={d} />
            <Positioning data={d} />
          </>
        )}
      </QueryState>
    </>
  )
}
