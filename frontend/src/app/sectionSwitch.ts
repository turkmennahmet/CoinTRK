import type { Market } from './market'

/** State of the sliding section-switch panel; rendered by SectionTransition. */

export type Phase = 'in' | 'hold' | 'out'

export interface Transition {
  to: Market
  go: () => unknown
  phase: Phase
}

let current: Transition | null = null
const listeners = new Set<() => void>()

export function update(next: Transition | null) {
  current = next
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Cover the screen, call `go` (the navigation) once covered, then uncover. */
export function startSectionTransition(to: Market, go: () => unknown) {
  if (current) return
  update({ to, go, phase: 'in' })
}

export function getTransition(): Transition | null {
  return current
}
