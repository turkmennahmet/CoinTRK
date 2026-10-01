import { useMemo } from 'react'

import { useFunding } from '../../api/queries'
import type { FundingRow } from '../../api/types'
import { DataTable, type Column } from '../../components/DataTable/DataTable'
import { Field, FilterBar, MinVolumeSelect, SearchInput } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { PartialDataNotice, QueryState } from '../../components/ui/QueryState'
import { Segmented } from '../../components/ui/Segmented'
import { NumCell, PctCell } from '../../components/ui/cells'
import { useNow } from '../../hooks/useNow'
import { useUrlEnum } from '../../hooks/useUrlState'
import { applyMarketFilters } from '../../lib/filters'
import { formatCountdown } from '../../lib/format'
import { change24hColumn, priceColumn, symbolColumn, volume24hColumn } from '../shared/columns'
import { useMarketFilters } from '../shared/useMarketFilters'

type Sign = 'all' | 'negative' | 'positive'
const SIGNS: readonly Sign[] = ['all', 'negative', 'positive']

function buildColumns(now: number): Column<FundingRow>[] {
  return [
    symbolColumn(),
    {
      id: 'rate',
      header: 'Funding',
      description: 'Bir sonraki ödeme zamanında uygulanacak oran',
      align: 'right',
      mobile: 'primary',
      cell: (r) => <PctCell value={r.funding_rate_pct} digits={4} />,
      sortValue: (r) => r.funding_rate_pct,
      firstSortDirection: 'asc',
    },
    {
      id: 'apr',
      header: 'Yıllık',
      description: 'Oran bu seviyede kalırsa yıllık karşılığı',
      align: 'right',
      cell: (r) => <PctCell value={r.apr_pct} digits={1} />,
      sortValue: (r) => r.apr_pct,
    },
    {
      id: 'interval',
      header: 'Periyot',
      align: 'right',
      cell: (r) => <NumCell>{`${r.interval_hours}s`}</NumCell>,
      sortValue: (r) => r.interval_hours,
    },
    {
      id: 'next',
      header: 'Sonraki ödeme',
      align: 'right',
      cell: (r) => <NumCell>{formatCountdown(r.next_funding_time, now)}</NumCell>,
      sortValue: (r) => r.next_funding_time,
      firstSortDirection: 'asc',
    },
    priceColumn((r) => r.mark_price),
    change24hColumn(),
    volume24hColumn(),
  ]
}

export default function FundingPage() {
  const [sign, setSign] = useUrlEnum<Sign>('sign', 'all', SIGNS)
  const { search, setSearch, minVolume, setMinVolume, filters } = useMarketFilters(1_000_000)
  const query = useFunding()
  const now = useNow(30_000)

  const columns = useMemo(() => buildColumns(now), [now])
  const rows = useMemo(() => {
    const data = applyMarketFilters(query.data?.rows ?? [], filters)
    if (sign === 'all') return data
    return data.filter((r) => (sign === 'negative' ? r.funding_rate_pct < 0 : r.funding_rate_pct > 0))
  }, [query.data, filters, sign])

  return (
    <>
      <PageHeader
        title="Funding Oranları"
        description="Pozitif funding'de longlar shortlara, negatifte shortlar longlara öder. Aşırı negatif funding kalabalık short pozisyonlara (olası short squeeze), aşırı pozitif ise kalabalık longlara işaret eder."
        generatedAt={query.data?.meta.generated_at}
        isFetching={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
      <FilterBar>
        <Field label="Yön">
          <Segmented
            ariaLabel="Funding yönü"
            value={sign}
            onChange={setSign}
            options={[
              { value: 'all', label: 'Tümü' },
              { value: 'negative', label: 'Negatif' },
              { value: 'positive', label: 'Pozitif' },
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
              caption="Funding oranları"
              rows={rows}
              columns={columns}
              getRowKey={(r) => r.symbol}
              initialSort={{ columnId: 'rate', direction: 'asc' }}
            />
          </>
        )}
      </QueryState>
    </>
  )
}
