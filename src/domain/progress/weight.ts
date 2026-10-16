// Courbe de poids : moyenne mobile 7 j, couloir cible, résumé (fonctions pures, sans arrondi).
import type { LocalDate } from '../../types/common'
import type { WeighIn } from '../../types/profile'
import { addDays, daysBetween } from '../shared/dates'

export function movingAverage7d(weighIns: WeighIn[], on: LocalDate): number | null {
  const from = addDays(on, -6)
  let sum = 0
  let n = 0
  for (const w of weighIns) {
    if (w.date >= from && w.date <= on) {
      sum += w.weightKg
      n++
    }
  }
  return n === 0 ? null : sum / n
}

export interface WeightPoint {
  date: LocalDate
  weightKg: number
  avg7d: number
}

/**
 * Pesées triées par date (tri stable) avec la moyenne mobile 7 j à chaque date (= `movingAverage7d`, doublons
 * de date compris). Fenêtre glissante à deux curseurs sur la liste triée, puis chaque point additionne sa
 * fenêtre triée par ordre d'entrée : O(n log n + n·k log k), k ≤ 7 (date unique en base). La somme est
 * refaite à chaque point (pas de somme courante +/−, qui accumulerait des erreurs d'arrondi) et suit l'ordre
 * de la liste d'entrée, comme `movingAverage7d` : le résultat est identique au bit près.
 */
export function weightSeries(weighIns: WeighIn[]): WeightPoint[] {
  type Indexed = { w: WeighIn; index: number }
  const sorted: Indexed[] = weighIns
    .map((w, index) => ({ w, index }))
    .sort((a, b) => (a.w.date < b.w.date ? -1 : a.w.date > b.w.date ? 1 : 0))
  const out: WeightPoint[] = []
  let lo = 0
  let hi = 0 // fenêtre = sorted[lo, hi)
  for (const { w } of sorted) {
    const from = addDays(w.date, -6)
    while (hi < sorted.length && (sorted[hi] as Indexed).w.date <= w.date) hi++
    while ((sorted[lo] as Indexed).w.date < from) lo++
    const window = sorted.slice(lo, hi).sort((a, b) => a.index - b.index)
    let sum = 0
    for (const x of window) sum += x.w.weightKg
    // la pesée elle-même est dans la fenêtre : jamais vide
    out.push({ date: w.date, weightKg: w.weightKg, avg7d: sum / window.length })
  }
  return out
}

export interface CorridorPoint {
  date: LocalDate
  lowKg: number
  highKg: number
}

export function weightTargetCorridor(
  startWeightKg: number,
  startDate: LocalDate,
  dates: LocalDate[],
): CorridorPoint[] {
  return dates.map((date) => {
    const weeks = daysBetween(startDate, date) / 7
    return {
      date,
      lowKg: startWeightKg * (1 + 0.0025 * weeks),
      highKg: startWeightKg * (1 + 0.005 * weeks),
    }
  })
}

export interface WeightSummary {
  latest: WeighIn | null
  avg7d: number | null
  change7dKg: number | null
  change28dKg: number | null
}

export function weightSummary(weighIns: WeighIn[], on: LocalDate): WeightSummary {
  let latest: WeighIn | null = null
  for (const w of weighIns) {
    if (w.date <= on && (latest === null || w.date >= latest.date)) latest = w
  }
  const avg = movingAverage7d(weighIns, on)
  const diff = (days: number): number | null => {
    const prev = movingAverage7d(weighIns, addDays(on, -days))
    return avg === null || prev === null ? null : avg - prev
  }
  return { latest, avg7d: avg, change7dKg: diff(7), change28dKg: diff(28) }
}
