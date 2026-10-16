// Bilan hebdomadaire (carte du lundi, SPEC §8). Reçoit des données déjà calculées ; aucune dépendance aux autres
// modules de progress/ hormis la moyenne mobile du poids.
import type { LocalDate } from '../../types/common'
import type { KcalSuggestion } from '../../types/nutrition'
import type { PersonalRecord } from '../../types/guided'
import type { Goal, WeighIn } from '../../types/profile'
import type { MuscleGroup } from '../../types/training'
import type {
  NutritionWeek,
  ReviewRule,
  ReviewSuggestion,
  WeekStart,
  WeeklyReview,
} from '../../types/progress'
import { addDays } from '../shared/dates'
import { MUSCLE_LABELS_FR } from '../training/volume'
import { weekStartOf } from './regularity'
import { movingAverage7d } from './weight'

export interface WeeklyReviewInput {
  weekStart: WeekStart
  sessions: number
  minutes: number
  /** `profile.sessionsPerWeek`. */
  plannedSessions: number
  records: PersonalRecord[]
  weighIns: WeighIn[]
  goal: Goal
  nutrition: NutritionWeek
  /** Grands groupes sous leur cible de volume (calculé par l'appelant, `volume.ts`). */
  majorGroupsBelowTarget: MuscleGroup[]
  /** Résultat de `kcalSuggestion(...)` à la fin de la semaine (`undefined` accepté) ; seule source de `weight_stalled`. */
  kcalSuggestion: KcalSuggestion | null | undefined
}

/** Seuils (voir `ReviewRule`). */
export const REVIEW_LOW_RATIO = 0.9
export const REVIEW_FAST_SHARE_PER_WEEK = 0.005
/** Pesées minimales dans la semaine évaluée pour conclure à une prise trop rapide. */
export const REVIEW_MIN_WEIGHINS = 3

// Libellés déplacés dans training/volume.ts (le moteur d'entraînement ne dépend pas de progress/) ; ré-export.
export { MUSCLE_LABELS_FR }

// ---------- Semaines ----------

/** Semaine écoulée : lundi → dimanche précédant la semaine de `today`. */
export function previousWeekRange(today: LocalDate): { from: LocalDate; to: LocalDate } {
  const from = addDays(weekStartOf(today), -7)
  return { from, to: addDays(from, 6) }
}

/**
 * La carte est visible dès le lundi et jusqu'au dimanche suivant tant que la semaine écoulée n'est pas fermée.
 * `lastDismissedWeek` = lundi de la dernière semaine fermée.
 */
export function shouldShowReview(today: LocalDate, lastDismissedWeek?: WeekStart): boolean {
  return lastDismissedWeek === undefined || lastDismissedWeek < previousWeekRange(today).from
}

// ---------- Suggestion ----------

function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one
}

function pct(ratio: number): number {
  return Math.round(ratio * 100)
}

export function suggest(input: WeeklyReviewInput): ReviewSuggestion {
  const { sessions, plannedSessions, nutrition: n, goal } = input
  const make = (rule: ReviewRule, message: string): ReviewSuggestion => ({ rule, message })

  if (sessions === 0 && n.daysLogged === 0) {
    return make(
      'no_data',
      "Rien d'enregistré la semaine dernière : une séance courte et tes repas du jour suffisent pour repartir.",
    )
  }
  if (sessions < plannedSessions) {
    return make(
      'few_sessions',
      `${sessions} ${plural(sessions, 'séance', 'séances')} sur ${plannedSessions} la semaine dernière : vise ${plannedSessions} la semaine prochaine, même courtes (20 min).`,
    )
  }
  if (n.avgProtein !== null && n.targetProtein > 0 && n.avgProtein < REVIEW_LOW_RATIO * n.targetProtein) {
    return make(
      'low_protein',
      `Protéines à ${pct(n.avgProtein / n.targetProtein)} % de l'objectif : ajoute un skyr ou une portion de poulet par jour.`,
    )
  }
  if (goal === 'bulk' && input.kcalSuggestion) {
    const kcal = Math.abs(Math.round(input.kcalSuggestion.kcal))
    return make(
      'weight_stalled',
      `Ton poids stagne depuis ${input.kcalSuggestion.days} jours : ajoute environ ${kcal} kcal par jour (un yaourt grec avec des flocons d’avoine) et regarde dans 3 semaines.`,
    )
  }
  if (goal === 'bulk' && weighInsInWeek(input) >= REVIEW_MIN_WEIGHINS) {
    const end = movingAverage7d(input.weighIns, addDays(input.weekStart, 6))
    const old = movingAverage7d(input.weighIns, addDays(input.weekStart, -8))
    if (end !== null && old !== null) {
      const perWeek = (end - old) / 2
      if (perWeek > REVIEW_FAST_SHARE_PER_WEEK * old) {
        return make(
          'weight_too_fast',
          `Tu prends environ ${perWeek.toFixed(1).replace('.', ',')} kg par semaine depuis 2 semaines, c'est un peu vite : retire environ 100 à 150 kcal par jour pour limiter le gras.`,
        )
      }
    }
  }
  if (n.avgKcal !== null && n.targetKcal > 0 && n.avgKcal < REVIEW_LOW_RATIO * n.targetKcal) {
    return make(
      'low_kcal',
      `Calories à ${pct(n.avgKcal / n.targetKcal)} % de l'objectif : ajoute une collation (fruit sec, beurre de cacahuète) chaque jour.`,
    )
  }
  if (input.majorGroupsBelowTarget.length > 0) {
    const names = input.majorGroupsBelowTarget.map((g) => MUSCLE_LABELS_FR[g]).join(', ')
    return make(
      'volume_gap',
      `Pas assez de séries pour : ${names}. Ajoute un exercice pour ${plural(input.majorGroupsBelowTarget.length, 'ce groupe', 'ces groupes')} la semaine prochaine.`,
    )
  }
  return make('all_good', 'Belle semaine, continue comme ça !')
}

function weighInsInWeek(input: WeeklyReviewInput): number {
  const end = addDays(input.weekStart, 6)
  return input.weighIns.filter((w) => w.date >= input.weekStart && w.date <= end).length
}

export function weeklyReview(input: WeeklyReviewInput): WeeklyReview {
  const end = movingAverage7d(input.weighIns, addDays(input.weekStart, 6))
  const before = movingAverage7d(input.weighIns, addDays(input.weekStart, -1))
  const weightChangeKg = end === null || before === null ? null : end - before
  return {
    weekStart: input.weekStart,
    sessions: input.sessions,
    plannedSessions: input.plannedSessions,
    minutes: input.minutes,
    records: input.records,
    weightChangeKg,
    nutrition: input.nutrition,
    suggestion: suggest(input),
  }
}
