// Les trois chiffres de tête de l'écran Progrès (v2). Fonctions pures.
import type { LocalDate } from '../../types/common'
import type { DayActivity } from '../../types/progress'

/** Séances faites ce mois-ci (mois calendaire de `today`, jusqu'à `today` inclus). */
export function sessionsThisMonth(days: readonly DayActivity[], today: LocalDate): number {
  const month = today.slice(0, 7)
  return days.reduce(
    (n, d) => (!d.future && d.date <= today && d.date.startsWith(month) ? n + d.sessions : n),
    0,
  )
}

/**
 * Part des jours évalués dont la nutrition est dans la cible (kcal ET protéines à ±10 %), en pourcentage entier.
 * Jours évalués = journal non vide et objectif connu (`nutritionOk` non nul) : un jour sans rien de logué n'est ni
 * bon ni mauvais, il ne tire pas le chiffre vers le bas ; la journée en cours (`today`) n'est pas évaluée.
 * `null` si aucun jour évalué.
 */
export function nutritionOkShare(days: readonly DayActivity[], today: LocalDate): number | null {
  // Aujourd'hui est exclu : la journée n'est pas finie, elle serait presque toujours « hors cible ».
  const rated = days.filter((d) => !d.future && d.date !== today && d.nutritionOk !== null)
  if (rated.length === 0) return null
  return Math.round((100 * rated.filter((d) => d.nutritionOk === true).length) / rated.length)
}
