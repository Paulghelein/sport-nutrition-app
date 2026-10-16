// Résumé d'un jour (v2, F2) : séances, repas et totaux face à l'objectif. Fonctions pures.
import type { Id, LocalDate } from '../../types/common'
import type { PersonalRecord } from '../../types/guided'
import type { MealSlot, FoodLogEntry } from '../../types/nutrition'
import type { DayTrainingLevel } from '../../types/progress'
import type { Session } from '../../types/training'
import { MEAL_SLOTS } from '../nutrition/journal'
import { compareSessionTime, summarizeSession } from '../training/summary'
import { dayActivities } from './calendar'
import type { DayTargets } from './calendar'
import { sessionMinutes } from './regularity'
import type { ExercisesById } from './strength'

export interface DaySessionSummary {
  id: Id
  minutes: number
  setsDone: number
  /** Exercices ayant au moins une série faite, dans l'ordre de la séance. */
  exerciseIds: Id[]
  /** Records battus par cette séance (comparée aux séances antérieures). */
  records: PersonalRecord[]
}

export interface DayMeal {
  slot: MealSlot
  kcal: number
  protein: number
  /** Noms des entrées, dans l'ordre du log. */
  names: string[]
}

export interface DaySummary {
  date: LocalDate
  future: boolean
  level: DayTrainingLevel
  sessions: DaySessionSummary[]
  /** Repas non vides seulement, dans l'ordre petit-déjeuner → collation. */
  meals: DayMeal[]
  totals: { kcal: number; protein: number }
  /** Objectifs du jour ; `null` si indéterminables (pas de pesée). */
  targets: DayTargets | null
  /** Même règle que le calendrier (kcal ET protéines à ±10 %). */
  nutritionOk: boolean | null
}

export interface DaySummaryInput {
  date: LocalDate
  today: LocalDate
  /** Historique complet des séances (les records se comparent aux séances antérieures). */
  sessions: readonly Session[]
  exercisesById: ExercisesById
  foodLog: readonly FoodLogEntry[]
  targetsFor: (date: LocalDate) => DayTargets | null
}

/** Résumé d'un jour : mêmes règles de niveau et de nutrition que `dayActivities` (une seule source de vérité). */
export function daySummary(input: DaySummaryInput): DaySummary {
  const { date, today, sessions, exercisesById, foodLog, targetsFor } = input
  const activity = dayActivities({
    from: date,
    to: date,
    today,
    sessions,
    exercisesById,
    foodLog,
    targetsFor,
  })[0]
  const future = date > today
  const base = { date, future, level: activity?.level ?? 0, nutritionOk: activity?.nutritionOk ?? null }
  if (future) return { ...base, sessions: [], meals: [], totals: { kcal: 0, protein: 0 }, targets: null }

  const library = [...exercisesById.values()]
  const done = sessions
    .filter((s) => s.status === 'done' && s.date === date)
    .sort((a, b) => compareSessionTime(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const daySessions: DaySessionSummary[] = done.map((s) => {
    const summary = summarizeSession(s, library, sessions)
    return {
      id: s.id,
      minutes: sessionMinutes(s),
      setsDone: summary.setsDone,
      exerciseIds: summary.exercises.filter((e) => e.setsDone > 0).map((e) => e.exerciseId),
      records: summary.records,
    }
  })

  const ofDay = foodLog
    .filter((e) => e.date === date)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
  const meals: DayMeal[] = MEAL_SLOTS.flatMap((slot) => {
    const list = ofDay.filter((e) => e.slot === slot)
    if (list.length === 0) return []
    return [
      {
        slot,
        kcal: list.reduce((a, e) => a + e.macros.kcal, 0),
        protein: list.reduce((a, e) => a + e.macros.protein, 0),
        names: list.map((e) => e.name),
      },
    ]
  })
  const totals = {
    kcal: meals.reduce((a, m) => a + m.kcal, 0),
    protein: meals.reduce((a, m) => a + m.protein, 0),
  }
  const target = targetsFor(date)
  const targets = target !== null && target.kcal > 0 && target.protein > 0 ? target : null
  return { ...base, sessions: daySessions, meals, totals, targets }
}
