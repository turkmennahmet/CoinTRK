import type { ReactNode } from 'react'

import styles from './ui.module.css'

export type BadgeTone = 'up' | 'down' | 'warn' | 'info' | 'violet' | 'neutral'

export function Badge({ tone = 'neutral', title, children }: { tone?: BadgeTone; title?: string; children: ReactNode }) {
  return (
    <span className={styles.badge} data-tone={tone} title={title}>
      {children}
    </span>
  )
}
