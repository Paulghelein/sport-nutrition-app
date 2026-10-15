import { isLearningUnloaded } from '../../domain/training'
import type {
  ExerciseState,
  LibraryExercise,
  SessionBlock,
  SessionCursor,
  SessionExercise,
  SetEntry,
} from '../../types'
import { formatRange, formatSeconds, kgText } from './format'

/** Horloge (séparée pour les gestionnaires d'événements). */
export const clockMs = (): number => Date.now()

// ---------------------------------------------------------------------------------------------------------------
// Description d'une série

export interface StepInfo {
  cursor: SessionCursor
  block: SessionBlock
  se: SessionExercise
  set: SetEntry
  exercise: LibraryExercise | undefined
  learning: boolean
}

export function describeStep(
  blocks: readonly SessionBlock[],
  cursor: SessionCursor,
  byId: ReadonlyMap<string, LibraryExercise>,
  states: readonly ExerciseState[],
): StepInfo | null {
  const block = blocks[cursor.block]
  const se = block?.exercises[cursor.exercise]
  const set = se?.sets[cursor.set]
  if (!block || !se || !set) return null
  const exercise = byId.get(se.exerciseId)
  const state = states.find((s) => s.exerciseId === se.exerciseId)
  return {
    cursor,
    block,
    se,
    set,
    exercise,
    learning: exercise !== undefined && isLearningUnloaded(exercise, state),
  }
}

export function usesDuration(info: StepInfo): boolean {
  return (
    info.set.targetDurationSec !== undefined ||
    (info.set.targetReps === undefined && info.exercise?.durationRange !== undefined)
  )
}

/**
 * Répétitions préremplies : reps réelles de la série précédente du même exercice (la dernière faite), sinon le bas
 * de la fourchette. Jamais le haut : valider sans toucher ne doit pas déclencher une hausse de charge.
 */
export function defaultReps(info: StepInfo): number {
  for (let i = info.cursor.set - 1; i >= 0; i--) {
    const s = info.se.sets[i]
    if (s?.status === 'done' && s.actualReps !== undefined) return s.actualReps
  }
  return info.set.targetReps?.[0] ?? info.exercise?.repRange?.[0] ?? 10
}

/** Durée préremplie : durée visée de la série, sinon bas de la fourchette de l'exercice. */
export function defaultDuration(info: StepInfo): number {
  return info.set.targetDurationSec ?? info.exercise?.durationRange?.[0] ?? 30
}

/** Charge à régler, en texte : « 12 kg », « Poids du corps », « Sans charge ». */
export function loadSummary(info: StepInfo): { big: string; unit: string; note: string | null } {
  if (info.set.loadKg !== undefined) return { big: kgText(info.set.loadKg), unit: 'kg', note: null }
  if (info.learning || info.exercise?.loadType === 'kettlebell') {
    return { big: 'Sans charge', unit: '', note: 'Apprentissage du geste : pas de poids pour l’instant.' }
  }
  return { big: 'Poids du corps', unit: '', note: null }
}

/** « 10 à 12 reps » ou « 30 s » (+ « par côté »). */
export function targetSummary(info: StepInfo): string {
  const side = info.exercise?.unilateral ? ' par côté' : ''
  if (usesDuration(info)) {
    const d = info.set.targetDurationSec ?? info.exercise?.durationRange?.[0]
    return d === undefined ? '' : `${formatSeconds(d)}${side}`
  }
  return info.set.targetReps ? `${formatRange(info.set.targetReps)} reps${side}` : ''
}
