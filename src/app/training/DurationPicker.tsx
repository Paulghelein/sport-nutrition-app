import { ChoiceGroup } from '../../ui'
import type { SessionDuration } from '../../types'
import { DURATIONS } from './durations'

const options = DURATIONS.map((d) => ({ value: d, label: `${d} min` }))

/** Quatre gros boutons côte à côte (48 px de haut, un pouce suffit). */
export function DurationPicker({
  value,
  onChange,
  legend = 'Temps disponible',
}: {
  value: SessionDuration
  onChange: (d: SessionDuration) => void
  legend?: string
}) {
  return <ChoiceGroup legend={legend} value={value} options={options} onChange={onChange} />
}
