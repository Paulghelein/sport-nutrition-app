import type { SessionDuration } from '../../types'
import { Segmented } from '../../ui/kit'
import { DURATIONS } from './durations'

const options = DURATIONS.map((d) => ({ value: d, label: `${d}\u00a0min` }))

/** Quatre durées en piste arrondie (44 px de haut, un pouce suffit). */
export function DurationPicker({
  value,
  onChange,
  legend = 'Temps disponible',
}: {
  value: SessionDuration
  onChange: (d: SessionDuration) => void
  legend?: string
}) {
  return <Segmented ariaLabel={legend} value={value} options={options} onChange={onChange} />
}
