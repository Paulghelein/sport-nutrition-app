import { DecimalField, TextField } from '../../ui'
import type { FreeDraft } from './freeDraft'

export function FreeFields({ draft, onChange }: { draft: FreeDraft; onChange: (next: FreeDraft) => void }) {
  const set = (key: keyof FreeDraft) => (value: string) => onChange({ ...draft, [key]: value })
  return (
    <div className="flex flex-col gap-3">
      <TextField label="Nom" value={draft.name} onChange={set('name')} maxLength={80} autoComplete="off" />
      <DecimalField label="Calories" value={draft.kcal} onChange={set('kcal')} unit="kcal" />
      <div className="grid grid-cols-3 gap-2">
        <DecimalField label="Protéines" value={draft.protein} onChange={set('protein')} unit="g" />
        <DecimalField label="Glucides" value={draft.carbs} onChange={set('carbs')} unit="g" />
        <DecimalField label="Lipides" value={draft.fat} onChange={set('fat')} unit="g" />
      </div>
      <p className="-mt-1 text-sm text-zinc-400">Protéines, glucides et lipides sont facultatifs.</p>
    </div>
  )
}
