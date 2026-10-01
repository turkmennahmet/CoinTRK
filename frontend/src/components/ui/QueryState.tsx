import type { ReactNode } from 'react'

import { ApiError } from '../../api/client'
import type { ResponseMeta } from '../../api/types'
import styles from './ui.module.css'

interface QueryStateProps<T> {
  data: T | undefined
  error: Error | null
  isPending: boolean
  onRetry: () => void
  children: (data: T) => ReactNode
}

/** Renders a skeleton, an error with retry, or the children with loaded data. */
export function QueryState<T>({ data, error, isPending, onRetry, children }: QueryStateProps<T>) {
  if (data !== undefined) return <>{children(data)}</>
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (isPending) return <Skeleton />
  return null
}

export function Skeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Yükleniyor">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.skeletonRow} style={{ opacity: 1 - i * 0.07 }} />
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Beklenmeyen bir hata oluştu.'
  return (
    <div className={styles.errorBox} role="alert">
      <h2>Veri alınamadı</h2>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className={styles.button} onClick={onRetry}>
          Tekrar dene
        </button>
      )}
    </div>
  )
}

/** Warns when some symbols could not be fetched, so a thinner table is not mistaken for the market. */
export function PartialDataNotice({ meta }: { meta: ResponseMeta }) {
  if (meta.failed_symbols.length === 0) return null
  return (
    <div className={styles.notice} role="status">
      {meta.failed_symbols.length} coin için veri alınamadı ve listede yer almıyor.
    </div>
  )
}

export function Legend({ children }: { children: ReactNode }) {
  return <div className={styles.legend}>{children}</div>
}
