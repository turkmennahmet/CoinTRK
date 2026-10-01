export type SortDirection = 'asc' | 'desc'
export type SortValue = number | string | null | undefined

/**
 * Stable sort that always puts missing values last, whatever the direction,
 * so "—" cells never crowd the top of a table.
 */
export function sortRows<T>(rows: readonly T[], getValue: (row: T) => SortValue, direction: SortDirection): T[] {
  const factor = direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((a, b) => {
      const aMissing = a.value == null || (typeof a.value === 'number' && Number.isNaN(a.value))
      const bMissing = b.value == null || (typeof b.value === 'number' && Number.isNaN(b.value))
      if (aMissing || bMissing) return aMissing === bMissing ? a.index - b.index : aMissing ? 1 : -1
      const cmp =
        typeof a.value === 'number' && typeof b.value === 'number'
          ? a.value - b.value
          : String(a.value).localeCompare(String(b.value))
      return cmp === 0 ? a.index - b.index : cmp * factor
    })
    .map((entry) => entry.row)
}
