import type { Macros, MealSlot } from '../../types'

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** Entier avec séparateur de milliers (« 3 047 »). */
export const fmtInt = (n: number): string => integer.format(Math.round(n))

/** Grammes au dixième, sans zéro inutile (« 31,2 », « 150 »). */
export const fmtG = (n: number): string => oneDecimal.format(Math.round(n * 10) / 10)

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collations',
}

/** Pour « Ajouter … ». */
export const SLOT_TO: Record<MealSlot, string> = {
  breakfast: 'au petit-déjeuner',
  lunch: 'au déjeuner',
  dinner: 'au dîner',
  snack: 'aux collations',
}

export const slotChoices = (['breakfast', 'lunch', 'dinner', 'snack'] as const).map((value) => ({
  value,
  label: SLOT_LABEL[value],
}))

export function isMealSlot(value: string | null): value is MealSlot {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack'
}

/** Repas probable selon l'heure, quand l'URL n'en précise pas. */
export function slotForNow(date = new Date()): MealSlot {
  const h = date.getHours()
  if (h < 10) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 18) return 'snack'
  return 'dinner'
}

/** « 183 kcal · P 31,2 · G 0 · L 6,5 » (valeurs déjà arrondies par l'appelant). */
export function macroLine(m: Macros): string {
  return `${fmtInt(m.kcal)} kcal · P ${fmtG(m.protein)} · G ${fmtG(m.carbs)} · L ${fmtG(m.fat)}`
}
