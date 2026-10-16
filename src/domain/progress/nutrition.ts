// Nutrition de la semaine pour la page Progrès (SPEC §8). Seuls les jours logués entrent dans les moyennes.
// Les objectifs sont fournis par l'appelant : choix assumé = objectif du jour actuel, appliqué à toute la période.
import type { LocalDate } from '../../types/common'
import type { FoodLogEntry } from '../../types/nutrition'
import { NUTRITION_DAY_TOLERANCE, type NutritionWeek } from '../../types/progress'
import { dayLog } from '../nutrition/journal'
import { addDays, daysBetween } from '../shared/dates'

export function nutritionWeek(
  entries: readonly FoodLogEntry[],
  from: LocalDate,
  to: LocalDate,
  targets: { kcal: number; protein: number },
): NutritionWeek {
  const inRange = entries.filter((e) => e.date >= from && e.date <= to)
  const days = new Set(inRange.map((e) => e.date))
  let kcal = 0
  let protein = 0
  let inTarget = 0
  const span = daysBetween(from, to)
  for (let i = 0; i <= span; i++) {
    const d = addDays(from, i)
    if (!days.has(d)) continue
    const t = dayLog(inRange, d).totals
    kcal += t.kcal
    protein += t.protein
    if (
      targets.kcal > 0 &&
      Math.abs(t.kcal - targets.kcal) <= NUTRITION_DAY_TOLERANCE * targets.kcal + 1e-9
    ) {
      inTarget++
    }
  }
  const n = days.size
  return {
    from,
    to,
    daysLogged: n,
    avgKcal: n === 0 ? null : kcal / n,
    avgProtein: n === 0 ? null : protein / n,
    targetKcal: targets.kcal,
    targetProtein: targets.protein,
    daysInTarget: inTarget,
  }
}
