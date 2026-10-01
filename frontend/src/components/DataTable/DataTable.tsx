import { useMemo, useState, type ReactNode } from 'react'

import { MOBILE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery'
import { sortRows, type SortDirection, type SortValue } from '../../lib/sort'
import styles from './DataTable.module.css'

export interface Column<T> {
  id: string
  header: string
  /** Longer explanation shown as a tooltip on the header. */
  description?: string
  cell: (row: T) => ReactNode
  sortValue?: (row: T) => SortValue
  /** Direction applied on the first click; numeric metrics usually want 'desc'. */
  firstSortDirection?: SortDirection
  align?: 'left' | 'right'
  /**
   * Mobile card placement. The first column is always the card title.
   * 'primary' goes top-right next to it, 'detail' into the grid below.
   */
  mobile?: 'primary' | 'detail' | 'hidden'
}

export interface SortState {
  columnId: string
  direction: SortDirection
}

interface DataTableProps<T> {
  rows: readonly T[]
  columns: readonly Column<T>[]
  getRowKey: (row: T) => string
  initialSort?: SortState
  pageSize?: number
  emptyMessage?: ReactNode
  caption?: string
}

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  initialSort,
  pageSize = 100,
  emptyMessage = 'Filtrelere uyan sonuç yok.',
  caption,
}: DataTableProps<T>) {
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const [sort, setSort] = useState<SortState | undefined>(initialSort)
  const [visibleCount, setVisibleCount] = useState(pageSize)

  const sorted = useMemo(() => {
    const column = sort && columns.find((c) => c.id === sort.columnId)
    if (!sort || !column?.sortValue) return rows
    return sortRows(rows, column.sortValue, sort.direction)
  }, [rows, columns, sort])

  const visible = sorted.slice(0, visibleCount)

  const toggleSort = (column: Column<T>) => {
    if (!column.sortValue) return
    setSort((current) =>
      current?.columnId === column.id
        ? { columnId: column.id, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { columnId: column.id, direction: column.firstSortDirection ?? 'desc' },
    )
  }

  if (rows.length === 0) {
    return <div className={styles.empty}>{emptyMessage}</div>
  }

  const footer =
    sorted.length > visibleCount ? (
      <button type="button" className={styles.more} onClick={() => setVisibleCount((n) => n + pageSize)}>
        Daha fazla göster ({sorted.length - visibleCount} kaldı)
      </button>
    ) : null

  if (isMobile) {
    return (
      <MobileCards
        rows={visible}
        columns={columns}
        getRowKey={getRowKey}
        sort={sort}
        onSort={toggleSort}
        footer={footer}
      />
    )
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.scroller}>
        <table className={styles.table}>
          {caption && <caption className="visually-hidden">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((column) => {
                const direction = sort?.columnId === column.id ? sort.direction : undefined
                const ariaSort = direction && (direction === 'asc' ? 'ascending' : 'descending')
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={ariaSort}
                    className={column.align === 'right' ? styles.right : undefined}
                    title={column.description}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        className={`${styles.sortButton} ${direction ? styles.sortActive : ''}`}
                        onClick={() => toggleSort(column)}
                      >
                        {column.header}
                        <SortIcon direction={direction} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td key={column.id} className={column.align === 'right' ? styles.right : undefined}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  )
}

interface MobileCardsProps<T> {
  rows: readonly T[]
  columns: readonly Column<T>[]
  getRowKey: (row: T) => string
  sort: SortState | undefined
  onSort: (column: Column<T>) => void
  footer: ReactNode
}

function MobileCards<T>({ rows, columns, getRowKey, sort, onSort, footer }: MobileCardsProps<T>) {
  const [titleColumn, ...rest] = columns
  const primary = rest.filter((c) => c.mobile === 'primary')
  const details = rest.filter((c) => (c.mobile ?? 'detail') === 'detail')
  const sortable = columns.filter((c) => c.sortValue)

  return (
    <div>
      {sortable.length > 0 && (
        <div className={styles.mobileSort}>
          <label htmlFor="mobile-sort" className="muted">
            Sırala
          </label>
          <select
            id="mobile-sort"
            value={sort?.columnId ?? ''}
            onChange={(event) => {
              const column = columns.find((c) => c.id === event.target.value)
              if (column) onSort(column)
            }}
          >
            {!sort && <option value="">—</option>}
            {sortable.map((column) => (
              <option key={column.id} value={column.id}>
                {column.header}
              </option>
            ))}
          </select>
          {sort && (
            <button
              type="button"
              className={styles.directionButton}
              onClick={() => {
                const column = columns.find((c) => c.id === sort.columnId)
                if (column) onSort(column)
              }}
              aria-label={sort.direction === 'asc' ? 'Artan sıralama' : 'Azalan sıralama'}
            >
              <SortIcon direction={sort.direction} />
            </button>
          )}
        </div>
      )}
      <ul className={styles.cards}>
        {rows.map((row) => (
          <li key={getRowKey(row)} className={styles.card}>
            <div className={styles.cardHeader}>
              <div>{titleColumn.cell(row)}</div>
              <div className={styles.cardPrimary}>
                {primary.map((column) => (
                  <div key={column.id}>{column.cell(row)}</div>
                ))}
              </div>
            </div>
            {details.length > 0 && (
              <dl className={styles.cardGrid}>
                {details.map((column) => (
                  <div key={column.id} className={styles.cardItem}>
                    <dt>{column.header}</dt>
                    <dd>{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
      {footer}
    </div>
  )
}

function SortIcon({ direction }: { direction?: SortDirection }) {
  return (
    <svg className={styles.sortIcon} width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
      <path d="M5 1 9 5H1z" opacity={direction === 'asc' ? 1 : 0.3} fill="currentColor" />
      <path d="M5 11 1 7h8z" opacity={direction === 'desc' ? 1 : 0.3} fill="currentColor" />
    </svg>
  )
}
