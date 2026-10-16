// Formulaire de mensurations : texte saisi -> valeurs validées (pure).
import { checkMeasurement } from '../../db'
import { parseDecimal, toInputNumber } from '../../ui/format'
import type { LocalDate, Measurement } from '../../types'

export const MEASURE_FIELDS = [
  { key: 'armCm', label: 'Bras' },
  { key: 'chestCm', label: 'Poitrine' },
  { key: 'waistCm', label: 'Taille' },
  { key: 'thighCm', label: 'Cuisse' },
] as const

export type MeasureKey = (typeof MEASURE_FIELDS)[number]['key']

export interface MeasurementDraft {
  date: LocalDate
  values: Record<MeasureKey, string>
  note: string
}

export function newMeasurementDraft(date: LocalDate): MeasurementDraft {
  return { date, values: { armCm: '', chestCm: '', waistCm: '', thighCm: '' }, note: '' }
}

export function measurementToDraft(m: Measurement): MeasurementDraft {
  const values = { armCm: '', chestCm: '', waistCm: '', thighCm: '' }
  for (const { key } of MEASURE_FIELDS) {
    const v = m[key]
    if (v !== undefined) values[key] = toInputNumber(v)
  }
  return { date: m.date, values, note: m.note ?? '' }
}

export type MeasurementValues = { date: LocalDate; note?: string } & Partial<Record<MeasureKey, number>>

export type DraftResult = { ok: true; input: MeasurementValues } | { ok: false; error: string }

/** Champs vides ignorés ; texte illisible = erreur ; bornes et date vérifiées par `checkMeasurement`. */
export function draftToMeasurement(draft: MeasurementDraft, today: LocalDate): DraftResult {
  const input: MeasurementValues = { date: draft.date }
  for (const { key, label } of MEASURE_FIELDS) {
    const text = draft.values[key].trim()
    if (text === '') continue
    const n = parseDecimal(text)
    if (Number.isNaN(n)) return { ok: false, error: `${label} : saisis un nombre en cm (ex. 34,5).` }
    input[key] = n
  }
  const note = draft.note.trim()
  if (note !== '') input.note = note
  const error = checkMeasurement(input, today)
  return error ? { ok: false, error } : { ok: true, input }
}

/** Historique : plus récent d'abord. */
export function sortMeasurements(rows: readonly Measurement[]): Measurement[] {
  return [...rows].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1,
  )
}

/** Patch complet pour `updateMeasurement` : un champ vidé est effacé (valeur `undefined`). */
export function measurementPatch(input: MeasurementValues): MeasurementValues {
  return {
    date: input.date,
    note: input.note,
    armCm: input.armCm,
    chestCm: input.chestCm,
    waistCm: input.waistCm,
    thighCm: input.thighCm,
  }
}
