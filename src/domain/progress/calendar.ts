// Calendrier de régularité (v2, F2) : niveau d'entraînement et état nutrition de chaque jour. Fonctions pures.
import type { LocalDate } from '../../types/common'
import type { FoodLogEntry } from '../../types/nutrition'
import { CALENDAR_NUTRITION_TOLERANCE, type DayActivity, type DayTrainingLevel } from '../../types/progress'
import type { Session } from '../../types/training'
import { addDays, daysBetween } from '../shared/dates'
import { summarizeSession } from '../training/summary'
import { sessionMinutes, weekStartOf } from './regularity'
import type { ExercisesById } from './strength'

/** Seuils de durée (minutes) : < 25 → niveau 1 ; 25 à 45 inclus → niveau 2 ; > 45 → niveau 3. */
export const CALENDAR_LEVEL_2_MIN = 25
export const CALENDAR_LEVEL_3_OVER_MIN = 45

/** Niveau 0 à 3 d'après les minutes cumulées du jour (aucune séance : 0 ; une séance de 0 minute vaut 1). Le niveau 4 est décidé ailleurs. */
export function levelFromMinutes(minutes: number, sessions: number): DayTrainingLevel {
  if (sessions <= 0) return 0
  if (minutes > CALENDAR_LEVEL_3_OVER_MIN) return 3
  if (minutes >= CALENDAR_LEVEL_2_MIN) return 2
  return 1
}

/** Les 7 dates (lundi → dimanche) de la semaine de `today`. */
export function weekDays(today: LocalDate): LocalDate[] {
  const monday = weekStartOf(today)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export interface DayTargets {
  kcal: number
  protein: number
}

export interface DayActivitiesInput {
  from: LocalDate
  to: LocalDate
  today: LocalDate
  /** Historique complet (pas seulement la plage), sinon faux records. */
  sessions: readonly Session[]
  /** Doit contenir les exercices supprimés (tonnage unilatéral), comme pour `recordsInRange`. */
  exercisesById: ExercisesById
  foodLog: readonly FoodLogEntry[]
  /** Objectifs du jour (poids de référence de ce jour) ; `null` si indéterminables (pas de pesée). */
  targetsFor: (date: LocalDate) => DayTargets | null
}

/** `true` si `value` est à ±`CALENDAR_NUTRITION_TOLERANCE` de `target` (bornes incluses). */
function within(value: number, target: number): boolean {
  return Math.abs(value - target) <= CALENDAR_NUTRITION_TOLERANCE * target + 1e-9
}

/**
 * Un élément par jour de `from` à `to` inclus (vide si `to < from`).
 * - Séances : seules les `done` du jour comptent ; minutes = somme de `sessionMinutes`. Niveau : voir
 *   `levelFromMinutes`, ou 4 si un record a été battu ce jour-là.
 * - Record : celui du récapitulatif de séance (`summarizeSession`, comme `recordsInRange` et la page Progrès) :
 *   une charge, une durée ou un tonnage dépassant les séances `done` antérieures ; la PREMIÈRE séance d'un exercice
 *   n'est PAS un record. Le jour du record = date de la séance qui l'a battu.
 * - Nutrition : `true` si kcal ET protéines du journal du jour sont à ±10 % de `targetsFor(date)` ; `false` journal
 *   non vide hors cible ; `null` si rien de logué, objectifs inconnus (`null` ou kcal/protéines <= 0) ou jour futur.
 * - Jour postérieur à `today` : `future: true`, niveau 0, `nutritionOk: null`, séances ignorées.
 * Coût : O(jours + séances + entrées) + O(R × H) pour les records (R séances `done` de la plage, H historique) ;
 * l'UI mémoïse (useMemo).
 */
export function dayActivities(input: DayActivitiesInput): DayActivity[] {
  const { from, to, today, sessions, exercisesById, foodLog, targetsFor } = input
  const span = daysBetween(from, to)
  if (!(span >= 0)) return []

  const library = [...exercisesById.values()]
  const byDay = new Map<LocalDate, { sessions: number; minutes: number; record: boolean }>()
  for (const s of sessions) {
    if (s.status !== 'done' || s.date < from || s.date > to || s.date > today) continue
    const day = byDay.get(s.date) ?? { sessions: 0, minutes: 0, record: false }
    day.sessions += 1
    day.minutes += sessionMinutes(s)
    if (!day.record) day.record = summarizeSession(s, library, sessions).records.length > 0
    byDay.set(s.date, day)
  }

  const nutrition = new Map<LocalDate, { kcal: number; protein: number }>()
  for (const e of foodLog) {
    if (e.date < from || e.date > to || e.date > today) continue
    const t = nutrition.get(e.date) ?? { kcal: 0, protein: 0 }
    t.kcal += e.macros.kcal
    t.protein += e.macros.protein
    nutrition.set(e.date, t)
  }

  const out: DayActivity[] = []
  for (let i = 0; i <= span; i++) {
    const date = addDays(from, i)
    if (date > today) {
      out.push({ date, level: 0, sessions: 0, minutes: 0, record: false, nutritionOk: null, future: true })
      continue
    }
    const train = byDay.get(date)
    const totals = nutrition.get(date)
    let nutritionOk: boolean | null = null
    if (totals !== undefined) {
      const target = targetsFor(date)
      if (target !== null && target.kcal > 0 && target.protein > 0) {
        nutritionOk = within(totals.kcal, target.kcal) && within(totals.protein, target.protein)
      }
    }
    const count = train?.sessions ?? 0
    const minutes = train?.minutes ?? 0
    const record = train?.record ?? false
    out.push({
      date,
      level: record ? 4 : levelFromMinutes(minutes, count),
      sessions: count,
      minutes,
      record,
      nutritionOk,
      future: false,
    })
  }
  return out
}
