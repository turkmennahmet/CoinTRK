import type { OIPeriod, ScannerInterval } from '../../api/types'
import { Field } from '../../components/ui/FilterBar'
import { Segmented } from '../../components/ui/Segmented'
import { intervalLabel } from '../../lib/intervals'

export function IntervalControl<T extends ScannerInterval | OIPeriod>({
  value,
  options,
  onChange,
  label = 'Zaman dilimi',
}: {
  value: T
  options: readonly T[]
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <Field label={label}>
      <Segmented
        ariaLabel={label}
        value={value}
        onChange={onChange}
        options={options.map((o) => ({ value: o, label: intervalLabel(o) }))}
      />
    </Field>
  )
}
