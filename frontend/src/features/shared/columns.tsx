import type { Column } from '../../components/DataTable/DataTable'
import { NumCell, PctCell, SymbolCell } from '../../components/ui/cells'
import { formatPrice, formatUsdCompact } from '../../lib/format'

interface MarketRow {
  symbol: string
  base_asset: string
  change_24h_pct: number
  quote_volume_24h: number
}

export function symbolColumn<T extends { symbol: string; base_asset: string }>(): Column<T> {
  return {
    id: 'symbol',
    header: 'Coin',
    cell: (row) => <SymbolCell symbol={row.symbol} base={row.base_asset} />,
    sortValue: (row) => row.base_asset,
    firstSortDirection: 'asc',
  }
}

export function priceColumn<T>(getPrice: (row: T) => number): Column<T> {
  return {
    id: 'price',
    header: 'Fiyat',
    align: 'right',
    cell: (row) => <NumCell>{formatPrice(getPrice(row))}</NumCell>,
    sortValue: getPrice,
  }
}

export function change24hColumn<T extends MarketRow>(mobile: Column<T>['mobile'] = 'detail'): Column<T> {
  return {
    id: 'change_24h',
    header: '24s %',
    align: 'right',
    mobile,
    cell: (row) => <PctCell value={row.change_24h_pct} />,
    sortValue: (row) => row.change_24h_pct,
  }
}

export function volume24hColumn<T extends MarketRow>(): Column<T> {
  return {
    id: 'volume_24h',
    header: '24s Hacim',
    align: 'right',
    cell: (row) => <NumCell>{formatUsdCompact(row.quote_volume_24h)}</NumCell>,
    sortValue: (row) => row.quote_volume_24h,
  }
}
