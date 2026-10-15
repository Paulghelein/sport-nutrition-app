import { parseDecimal } from '../../ui'
import type { FreeEntryInput } from '../../types'

export interface FreeDraft {
  name: string
  kcal: string
  protein: string
  carbs: string
  fat: string
}

export const emptyFreeDraft: FreeDraft = { name: '', kcal: '', protein: '', carbs: '', fat: '' }

export type FreeParse = { ok: true; value: FreeEntryInput } | { ok: false; error: string }

/** Nom + kcal obligatoires ; macros facultatives (vide → absent). Virgule décimale acceptée. */
export function parseFreeDraft(d: FreeDraft): FreeParse {
  const name = d.name.trim()
  if (name === '') return { ok: false, error: 'Donne un nom à cette saisie.' }
  const kcal = parseDecimal(d.kcal)
  if (Number.isNaN(kcal)) return { ok: false, error: 'Indique les calories (un nombre, par exemple 350).' }
  const optional = (text: string): number | undefined | 'bad' => {
    if (text.trim() === '') return undefined
    const v = parseDecimal(text)
    return Number.isNaN(v) ? 'bad' : v
  }
  const protein = optional(d.protein)
  const carbs = optional(d.carbs)
  const fat = optional(d.fat)
  if (protein === 'bad' || carbs === 'bad' || fat === 'bad') {
    return { ok: false, error: 'Protéines, glucides et lipides doivent être des nombres (ou rester vides).' }
  }
  const value: FreeEntryInput = { name, kcal }
  if (protein !== undefined) value.protein = protein
  if (carbs !== undefined) value.carbs = carbs
  if (fat !== undefined) value.fat = fat
  return { ok: true, value }
}
