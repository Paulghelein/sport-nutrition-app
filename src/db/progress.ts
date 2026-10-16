// Lecture groupée pour l'écran Progrès (J8).
import { addDays, toLocalDate } from '../domain/shared/dates'
import type {
  Exercise,
  ExercisePref,
  ExerciseState,
  FoodLogEntry,
  LocalDate,
  Measurement,
  Profile,
  Session,
  Settings,
  WeighIn,
} from '../types'
import { db } from './database'
import { listLogBetween } from './nutrition'
import {
  getProfile,
  getSettings,
  listExercisePrefs,
  listExerciseRows,
  listExerciseStates,
  listMeasurements,
  listWeighIns,
  sortSessions,
} from './repositories'

/**
 * Fenêtre du journal alimentaire lue pour l'écran Progrès, en jours (aujourd'hui compris) : 12 semaines du calendrier
 * (jusqu'à 83 jours en arrière, le lundi de la première colonne) ; les autres sections filtrent leur propre plage.
 */
export const PROGRESS_FOOD_DAYS = 84

export interface ProgressData {
  profile: Profile | undefined
  settings: Settings
  weighIns: WeighIn[]
  measurements: Measurement[]
  /** Séances `done` uniquement, même ordre que `listSessions`. */
  sessions: Session[]
  states: ExerciseState[]
  /** Lignes de base de la table `exercises` (y compris supprimées) ; la bibliothèque embarquée est fusionnée par l'UI. */
  exerciseRows: Exercise[]
  prefs: ExercisePref[]
  /** Journal des `PROGRESS_FOOD_DAYS` derniers jours jusqu'à `today` inclus. */
  foodLog: FoodLogEntry[]
}

/** Lit en une transaction (lecture seule, cohérente) tout ce dont l'écran Progrès a besoin. */
export async function loadProgressData(today: LocalDate = toLocalDate(new Date())): Promise<ProgressData> {
  const from = addDays(today, -(PROGRESS_FOOD_DAYS - 1))
  return db.transaction(
    'r',
    [
      db.profile,
      db.settings,
      db.weighIns,
      db.measurements,
      db.sessions,
      db.exerciseState,
      db.exercises,
      db.exercisePrefs,
      db.foodLog,
    ],
    async () => {
      const [profile, settings, weighIns, measurements, sessions, states, exerciseRows, prefs, foodLog] =
        await Promise.all([
          getProfile(),
          getSettings(),
          listWeighIns(),
          listMeasurements(),
          db.sessions.where('status').equals('done').toArray().then(sortSessions),
          listExerciseStates(),
          listExerciseRows(),
          listExercisePrefs(),
          listLogBetween(from, today),
        ])
      return {
        profile,
        settings,
        weighIns,
        measurements,
        sessions,
        states,
        exerciseRows,
        prefs,
        foodLog,
      }
    },
  )
}

export interface CalendarData {
  profile: Profile | undefined
  weighIns: WeighIn[]
  /** Séances `done` de tout l'historique : les records d'un jour se comparent aux séances antérieures. */
  sessions: Session[]
  /** Lignes de base de la table `exercises` (y compris supprimées). */
  exerciseRows: Exercise[]
  /** Journal de `from` à `to` inclus. */
  foodLog: FoodLogEntry[]
}

/**
 * Lecture ciblée pour le calendrier de régularité et les résumés de jour (carte « Ta semaine » d'Aujourd'hui) :
 * ni réglages, ni mensurations, ni états de progression, et le journal limité à `from`–`to` (7 jours au lieu de
 * toute la fenêtre de l'écran Progrès). Une transaction en lecture seule.
 */
export async function loadCalendarData(from: LocalDate, to: LocalDate): Promise<CalendarData> {
  return db.transaction('r', [db.profile, db.weighIns, db.sessions, db.exercises, db.foodLog], async () => {
    const [profile, weighIns, sessions, exerciseRows, foodLog] = await Promise.all([
      getProfile(),
      listWeighIns(),
      db.sessions.where('status').equals('done').toArray().then(sortSessions),
      listExerciseRows(),
      listLogBetween(from, to),
    ])
    return { profile, weighIns, sessions, exerciseRows, foodLog }
  })
}
