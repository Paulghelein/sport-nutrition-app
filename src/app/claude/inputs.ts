// Entrées des messages « Demander à Claude » (J9) : fonctions pures qui tirent ce que chaque builder de
// src/domain/claude/context.ts attend des données déjà chargées par les écrans. Aucun React, aucun Dexie.
import type {
  ClaudeBaseInput,
  ProgressContextInput,
  ReviewContextInput,
  SessionAfterContextInput,
  SessionBeforeContextInput,
} from '../../domain/claude/context'
import { nutritionTargets, targetWeight } from '../../domain/nutrition/targets'
import { addDays } from '../../domain/shared/dates'
import type {
  Equipment,
  LibraryExercise,
  LocalDate,
  PatternLevels,
  Profile,
  Session,
  SessionBlock,
  WeeklyReview,
  WeighIn,
} from '../../types'
import type { SessionSummary } from '../../types/guided'
import type { ProgressModel } from '../progress/progressModel'

/** Un builder reçoit la base complétée de la demande saisie. */
export type ClaudeBase = Omit<ClaudeBaseInput, 'request'>

/**
 * Profil, matériel et objectifs du jour. `undefined` sans profil ni pesée : les objectifs (et le résumé de profil
 * joint à chaque message) ont besoin du poids.
 */
export function claudeBase(args: {
  profile: Profile | undefined
  equipment: Equipment | undefined
  weighIns: readonly WeighIn[]
  today: LocalDate
}): ClaudeBase | undefined {
  const { profile, equipment, weighIns, today } = args
  if (!profile || !equipment) return undefined
  const weight = targetWeight(weighIns, today)
  if (weight === undefined) return undefined
  return { profile, equipment, targets: nutritionTargets(profile, weight, today), today }
}

export type SessionBeforeData = Omit<SessionBeforeContextInput, keyof ClaudeBaseInput>

/** Séance affichée dans l'aperçu (éventuellement modifiée par l'utilisateur) : blocs et durée estimée à jour. */
export function sessionBeforeData(
  plan: { durationMin: number; deload: boolean },
  blocks: SessionBlock[],
  estimatedMin: number,
  library: readonly LibraryExercise[],
  patternLevels?: PatternLevels,
): SessionBeforeData {
  return {
    plan: { durationMin: plan.durationMin, estimatedMin, deload: plan.deload, blocks },
    library,
    ...(patternLevels ? { patternLevels } : {}),
  }
}

export type SessionAfterData = Omit<SessionAfterContextInput, keyof ClaudeBaseInput>

export function sessionAfterData(
  session: Session,
  summary: SessionSummary,
  library: readonly LibraryExercise[],
): SessionAfterData {
  return {
    session,
    ...(summary.actualMin !== undefined ? { actualMin: summary.actualMin } : {}),
    records: summary.records,
    exercises: library,
  }
}

export type ProgressData = Omit<ProgressContextInput, keyof ClaudeBaseInput>

/** Nombre de jours (aujourd'hui compris) de la fenêtre de pesées envoyée. */
const WEIGHT_WINDOW_DAYS = 28

export function progressData(model: ProgressModel): ProgressData {
  const { summary, recent } = model.weight
  const since = addDays(model.today, -(WEIGHT_WINDOW_DAYS - 1))
  const avg = summary.avg7d
  return {
    weight: {
      avg7Kg: avg,
      avg7Kg28DaysAgo: avg !== null && summary.change28dKg !== null ? avg - summary.change28dKg : null,
      weighIns28d: recent.filter((w) => w.date >= since && w.date <= model.today).length,
    },
    regularity: model.regularity,
    volume: model.volumes,
    nutritionWeek: model.nutrition,
    strength: model.strength.map((r) => r.strength),
    exercises: model.strength.map((r) => ({ id: r.exerciseId, name: r.name })),
  }
}

export type ReviewData = Omit<ReviewContextInput, keyof ClaudeBaseInput>

export function reviewData(review: WeeklyReview, nameOf: (id: string) => string): ReviewData {
  const ids = [...new Set(review.records.map((r) => r.exerciseId))]
  return { review, exercises: ids.map((id) => ({ id, name: nameOf(id) })) }
}
