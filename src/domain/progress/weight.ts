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

export function weightSeries(weighIns: WeighIn[]): WeightPoint[] {
  return [...weighIns]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((w) => ({
      date: w.date,
      weightKg: w.weightKg,
      // la pesée elle-même est dans la fenêtre : jamais null
      avg7d: movingAverage7d(weighIns, w.date) as number,
    }))
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
