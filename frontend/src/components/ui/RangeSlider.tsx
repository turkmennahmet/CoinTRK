import { useState } from 'react'

import styles from './RangeSlider.module.css'

interface RangeSliderProps {
  label: string
  min: number
  max: number
  step?: number
  low: number
  high: number
  onLowChange: (value: number) => void
  onHighChange: (value: number) => void
}

/** Two-thumb slider built from two native range inputs, so keyboard and screen readers work as usual. */
export function RangeSlider({ label, min, max, step = 1, low, high, onLowChange, onHighChange }: RangeSliderProps) {
  const pct = (value: number) => ((value - min) / (max - min)) * 100
  const lowPct = pct(low)
  const highPct = pct(high)

  return (
    <div className={styles.field}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={`${styles.values} num`}>
          {low} – {high}
        </span>
      </div>
      <div className={styles.slider}>
        <div className={styles.track} aria-hidden="true">
          <span className={styles.fill} style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }} />
        </div>
        <input
          type="range"
          className={styles.input}
          min={min}
          max={max}
          step={step}
          value={low}
          aria-label={`${label} alt sınır`}
          // Keep the low thumb reachable when both thumbs sit at the maximum.
          style={{ zIndex: low >= max - step ? 3 : 2 }}
          onChange={(event) => onLowChange(Math.min(Number(event.target.value), high))}
        />
        <input
          type="range"
          className={styles.input}
          min={min}
          max={max}
          step={step}
          value={high}
          aria-label={`${label} üst sınır`}
          onChange={(event) => onHighChange(Math.max(Number(event.target.value), low))}
        />
      </div>
    </div>
  )
}

interface RangeFilterProps {
  label: string
  min: number
  max: number
  /** The applied range. */
  low: number
  high: number
  onApply: (low: number, high: number) => void
}

/**
 * A range slider that only filters when "Filtrele" is pressed. Filtering a large
 * table on every drag step makes the thumbs stutter.
 */
export function RangeFilter({ label, min, max, low, high, onApply }: RangeFilterProps) {
  const [draft, setDraft] = useState<[number, number]>([low, high])
  const [applied, setApplied] = useState<[number, number]>([low, high])
  // The applied range can change from outside (back button, reset link): follow it.
  if (applied[0] !== low || applied[1] !== high) {
    setApplied([low, high])
    setDraft([low, high])
  }
  const dirty = draft[0] !== low || draft[1] !== high

  return (
    <div className={styles.filter}>
      <RangeSlider
        label={label}
        min={min}
        max={max}
        low={draft[0]}
        high={draft[1]}
        onLowChange={(value) => setDraft([value, draft[1]])}
        onHighChange={(value) => setDraft([draft[0], value])}
      />
      <button type="button" className={styles.apply} disabled={!dirty} onClick={() => onApply(draft[0], draft[1])}>
        Filtrele
      </button>
    </div>
  )
}
