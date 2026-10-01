import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/**
 * Filter state stored in the URL query string, so a filtered view can be
 * bookmarked or shared and survives reloads. Values not in `allowed` fall back
 * to `defaultValue`, which protects against hand-edited URLs.
 */
export function useUrlEnum<T extends string>(
  key: string,
  defaultValue: T,
  allowed: readonly T[],
): [T, (value: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key)
  const value = raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : defaultValue

  const setValue = useCallback(
    (next: T) => {
      setParams(
        (prev) => {
          const updated = new URLSearchParams(prev)
          if (next === defaultValue) updated.delete(key)
          else updated.set(key, next)
          return updated
        },
        { replace: true },
      )
    },
    [key, defaultValue, setParams],
  )

  return [value, setValue]
}

export function useUrlNumber(
  key: string,
  defaultValue: number,
  allowed: readonly number[],
): [number, (value: number) => void] {
  const asStrings = allowed.map(String)
  const [raw, setRaw] = useUrlEnum(key, String(defaultValue), asStrings)
  const setValue = useCallback((next: number) => setRaw(String(next)), [setRaw])
  return [Number(raw), setValue]
}

/** Whole numbers 0…100, e.g. for RSI bounds. */
export const PERCENT_VALUES: readonly number[] = Array.from({ length: 101 }, (_, i) => i)

/**
 * A low/high pair kept in two query parameters. Both are written in one update:
 * two separate setters called together would overwrite each other.
 */
export function useUrlRange(
  lowKey: string,
  highKey: string,
  defaults: readonly [number, number],
  allowed: readonly number[],
): [readonly [number, number], (low: number, high: number) => void] {
  const [params, setParams] = useSearchParams()
  const read = (key: string, fallback: number) => {
    const raw = params.get(key)
    const value = raw === null ? NaN : Number(raw)
    return allowed.includes(value) ? value : fallback
  }
  let low = read(lowKey, defaults[0])
  let high = read(highKey, defaults[1])
  if (low > high) [low, high] = defaults

  const [defaultLow, defaultHigh] = defaults
  const setRange = useCallback(
    (nextLow: number, nextHigh: number) => {
      setParams(
        (prev) => {
          const updated = new URLSearchParams(prev)
          for (const [key, value, fallback] of [
            [lowKey, nextLow, defaultLow],
            [highKey, nextHigh, defaultHigh],
          ] as const) {
            if (value === fallback) updated.delete(key)
            else updated.set(key, String(value))
          }
          return updated
        },
        { replace: true },
      )
    },
    [lowKey, highKey, defaultLow, defaultHigh, setParams],
  )

  return [[low, high], setRange]
}

export function useUrlString(key: string): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) ?? ''
  const setValue = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const updated = new URLSearchParams(prev)
          if (next) updated.set(key, next)
          else updated.delete(key)
          return updated
        },
        { replace: true },
      )
    },
    [key, setParams],
  )
  return [value, setValue]
}
