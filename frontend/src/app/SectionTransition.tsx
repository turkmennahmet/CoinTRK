import { useSyncExternalStore, type AnimationEvent } from 'react'

import type { Market } from './market'
import { getTransition, subscribe, update } from './sectionSwitch'
import styles from './SectionTransition.module.css'

/**
 * Full-screen panel shown when switching between the futures and the Alpha
 * site: it slides in, the section changes underneath it, and it slides away.
 * It is rendered next to the router (see main.tsx) because the shell it is
 * started from unmounts halfway through.
 */

const LABELS: Record<Market, { title: string; subtitle: string }> = {
  alpha: { title: 'Web3 Alpha', subtitle: 'Binance Alpha tokenleri' },
  futures: { title: 'Futures / Spot', subtitle: 'Binance coin tarayıcısı' },
}

/** Least time the panel stays up, so its title can be read. */
const HOLD_MS = 350
/** Slide away even if the new section is still loading after this long. */
const MAX_WAIT_MS = 3000

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function SectionTransition() {
  const transition = useSyncExternalStore(subscribe, getTransition)
  if (!transition) return null

  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    // The title has animations of its own; only the panel's matter here.
    if (event.target !== event.currentTarget) return
    if (transition.phase === 'in') {
      update({ ...transition, phase: 'hold' })
      // Wait for the new section (its page is lazy-loaded) before revealing it.
      const navigated = Promise.race([Promise.resolve(transition.go()), delay(MAX_WAIT_MS)])
      void Promise.all([navigated, delay(HOLD_MS)]).then(() => update({ ...transition, phase: 'out' }))
    } else if (transition.phase === 'out') {
      update(null)
    }
  }

  const label = LABELS[transition.to]
  return (
    <div className={styles.panel} data-to={transition.to} data-phase={transition.phase} onAnimationEnd={onAnimationEnd}>
      <div className={styles.content} role="status">
        <span className={styles.title}>{label.title}</span>
        <span className={styles.subtitle}>{label.subtitle}</span>
      </div>
    </div>
  )
}
