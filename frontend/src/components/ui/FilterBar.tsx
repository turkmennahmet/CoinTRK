import type { ReactNode } from 'react'

import { formatUsdCompact } from '../../lib/format'
import { MIN_VOLUME_OPTIONS } from '../../lib/filters'
import styles from './ui.module.css'

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className={styles.filterBar}>{children}</div>
}

export function Field({ label, half, children }: { label: string; half?: boolean; children: ReactNode }) {
  return (
    <div className={`${styles.field} ${half ? styles.fieldHalf : ''}`}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </div>
  )
}

export function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Coin ara">
      <div className={styles.search}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          className={styles.input}
          type="search"
          inputMode="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="BTC, ETH…"
          aria-label="Coin ara"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </Field>
  )
}

export function MinVolumeSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <Field label="Min. 24s hacim" half>
      <select
        className={styles.select}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Minimum 24 saatlik hacim"
      >
        {MIN_VOLUME_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option === 0 ? 'Tümü' : `≥ ${formatUsdCompact(option)}`}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  half = true,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  half?: boolean
}) {
  return (
    <Field label={label} half={half}>
      <select
        className={styles.select}
        value={String(value)}
        aria-label={label}
        onChange={(event) => {
          const match = options.find((o) => String(o.value) === event.target.value)
          if (match) onChange(match.value)
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}
