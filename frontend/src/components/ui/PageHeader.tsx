import type { ReactNode } from 'react'

import { useNow } from '../../hooks/useNow'
import { formatRelativeTime } from '../../lib/format'
import styles from './ui.module.css'

interface PageHeaderProps {
  title: string
  description: ReactNode
  generatedAt?: number
  isFetching?: boolean
  onRefresh?: () => void
}

export function PageHeader({ title, description, generatedAt, isFetching, onRefresh }: PageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1 className={styles.pageTitle}>{title}</h1>
        <p className={styles.pageDescription}>{description}</p>
      </div>
      {(generatedAt || onRefresh) && (
        <DataStatus generatedAt={generatedAt} isFetching={isFetching} onRefresh={onRefresh} />
      )}
    </header>
  )
}

function DataStatus({ generatedAt, isFetching, onRefresh }: Omit<PageHeaderProps, 'title' | 'description'>) {
  const now = useNow(10_000)
  return (
    <div className={styles.status} aria-live="polite">
      {generatedAt && (
        <>
          <span className={styles.liveDot} aria-hidden="true" />
          <span>Güncellendi: {formatRelativeTime(generatedAt, now)}</span>
        </>
      )}
      {onRefresh && (
        <button
          type="button"
          className={styles.refresh}
          onClick={onRefresh}
          disabled={isFetching}
          data-spinning={isFetching}
          aria-label="Verileri yenile"
          title="Yenile"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      )}
    </div>
  )
}
