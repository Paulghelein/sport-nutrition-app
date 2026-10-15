import { ChoiceGroup } from './ChoiceGroup'
import { activities, goals, levels, sexes } from './choices'
import { Stepper } from './Stepper'
import { DateField, DecimalField, TextField } from './Field'
import type { ProfileDraft } from './drafts'
import { toLocalDate } from '../domain/shared'

interface FieldsProps {
  draft: ProfileDraft
  onChange: (draft: ProfileDraft) => void
}

/** Prénom, sexe, naissance, taille, activité. */
export function IdentityFields({ draft, onChange }: FieldsProps) {
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => onChange({ ...draft, [key]: value })
  return (
    <div className="flex flex-col gap-5">
      <TextField
        label="Prénom (facultatif)"
        value={draft.name}
        onChange={(v) => set('name', v)}
        autoComplete="given-name"
        maxLength={40}
      />
      <ChoiceGroup legend="Sexe" options={sexes} value={draft.sex} onChange={(v) => set('sex', v)} />
      <DateField
        label="Date de naissance"
        value={draft.birthDate}
        onChange={(v) => set('birthDate', v)}
        max={toLocalDate(new Date())}
      />
      <DecimalField
        label="Taille"
        unit="cm"
        value={draft.heightCm}
        onChange={(v) => set('heightCm', v)}
        placeholder="178"
      />
      <ChoiceGroup
        legend="Activité au quotidien"
        layout="stack"
        options={activities}
        value={draft.activityLevel}
        onChange={(v) => set('activityLevel', v)}
      />
    </div>
  )
}

/** Objectif, niveau, fréquence. */
export function GoalFields({ draft, onChange }: FieldsProps) {
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => onChange({ ...draft, [key]: value })
  return (
    <div className="flex flex-col gap-5">
      <ChoiceGroup legend="Objectif" options={goals} value={draft.goal} onChange={(v) => set('goal', v)} />
      <ChoiceGroup legend="Niveau en musculation" options={levels} value={draft.level} onChange={(v) => set('level', v)} />
      <Stepper
        legend="Séances par semaine (cible)"
        unitLabel="séances par semaine, cible"
        min={1}
        max={7}
        value={Number(draft.weeklySessionsTarget)}
        onChange={(v) => set('weeklySessionsTarget', String(v))}
      />
      <Stepper
        legend="Minimum par semaine"
        unitLabel="séances minimum par semaine"
        min={1}
        max={7}
        value={Number(draft.weeklySessionsMin)}
        onChange={(v) => set('weeklySessionsMin', String(v))}
      />
    </div>
  )
}
