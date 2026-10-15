import { CheckRow } from './CheckRow'
import { DecimalField } from './Field'
import { ownableEquipment } from './drafts'
import type { EquipmentDraft } from './drafts'
import type { EquipmentId } from '../types'

interface Props {
  draft: EquipmentDraft
  onChange: (draft: EquipmentDraft) => void
}

export function EquipmentFields({ draft, onChange }: Props) {
  const toggle = (id: EquipmentId, on: boolean) =>
    onChange({ ...draft, owned: on ? [...draft.owned, id] : draft.owned.filter((x) => x !== id) })
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-medium text-zinc-300">Kettlebell réglable</legend>
        <div className="grid grid-cols-3 gap-3">
          <DecimalField label="Minimum" unit="kg" value={draft.minKg} onChange={(v) => onChange({ ...draft, minKg: v })} />
          <DecimalField label="Maximum" unit="kg" value={draft.maxKg} onChange={(v) => onChange({ ...draft, maxKg: v })} />
          <DecimalField label="Pas" unit="kg" value={draft.stepKg} onChange={(v) => onChange({ ...draft, stepKg: v })} />
        </div>
      </fieldset>
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-medium text-zinc-300">Autre matériel</legend>
        <div className="flex flex-col gap-2">
          {ownableEquipment.map((item) => (
            <CheckRow
              key={item.id}
              label={item.label}
              hint={item.hint}
              checked={draft.owned.includes(item.id)}
              onChange={(on) => toggle(item.id, on)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  )
}
