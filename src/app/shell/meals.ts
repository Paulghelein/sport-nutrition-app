import type { LogMealOption } from '../../ui/kit'

/** Repas proposés dans la feuille Ajouter (libellés français). */
export const LOG_MEALS = [
  { id: 'breakfast', label: 'petit-déjeuner', phrase: 'au petit-déjeuner' },
  { id: 'lunch', label: 'déjeuner', phrase: 'au déjeuner' },
  { id: 'dinner', label: 'dîner', phrase: 'au dîner' },
  { id: 'snack', label: 'collation', phrase: 'à la collation' },
] as const satisfies readonly LogMealOption[]
