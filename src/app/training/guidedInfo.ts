import { isLearningUnloaded, timedMaxWindowOf } from '../../domain/training'
import type {
  ExerciseState,
  LibraryExercise,
  SessionBlock,
  SessionCursor,
  SessionExercise,
  SetEntry,
  SetType,
} from '../../types'
import { formatSeconds, kgText } from './format'
import { effectiveType, rangeText } from './prescription'

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
  /** État de progression de l'exercice (record `timedMax`, charge). */
  state: ExerciseState | undefined
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
    state,
    learning: exercise !== undefined && isLearningUnloaded(exercise, state),
  }
}

/**
 * Type de la série affichée (`reps`, `time`, `amrap`, `timedMax`), lu via `setTypeOf` : jamais d'après la seule
 * présence de `targetDurationSec` (une série `timedMax` en a une, c'est sa fenêtre).
 */
export function stepType(info: StepInfo): SetType {
  return effectiveType(info.set, info.exercise)
}

/** Fenêtre (secondes) d'une série en temps fixe, sinon `undefined`. */
export function stepWindow(info: StepInfo): number | undefined {
  return stepType(info) === 'timedMax' ? timedMaxWindowOf(info.set) : undefined
}

/**
 * Répétitions préremplies : reps réelles de la série précédente du même exercice (la dernière faite), sinon le bas
 * de la fourchette. Jamais le haut : valider sans toucher ne doit pas déclencher une hausse de charge.
 */
export function defaultReps(info: StepInfo): number {
  // Temps fixe : le record à la même fenêtre et à la même charge, sinon 0 (aucune cible de répétitions).
  if (stepType(info) === 'timedMax') return timedMaxRecord(info) ?? 0
  for (let i = info.cursor.set - 1; i >= 0; i--) {
    const s = info.se.sets[i]
    if (s?.status === 'done' && s.actualReps !== undefined) return s.actualReps
  }
  return info.set.targetReps?.[0] ?? info.exercise?.repRange?.[0] ?? 10
}

/** Record `timedMaxBestReps` de l'exercice si la fenêtre et la charge sont celles de la série affichée. */
export function timedMaxRecord(info: StepInfo): number | undefined {
  const st = info.state
  if (st?.timedMaxBestReps === undefined || st.timedMaxSec !== stepWindow(info)) return undefined
  return (st.loadKg ?? undefined) === info.set.loadKg ? st.timedMaxBestReps : undefined
}

/** Cible et charge de la série pour la carte « Ensuite » : « 18 kg × 8–12 reps », « max », « 16 kg · max en 45 s ». */
export function nextDetail(info: StepInfo): string {
  const target = targetSummary(info)
  const load = info.set.loadKg !== undefined ? `${kgText(info.set.loadKg)} kg` : null
  if (load !== null && target !== '' && stepType(info) === 'reps') return `${load} × ${target}`
  return [load, target].filter(Boolean).join(' · ')
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

/** « 8–12 reps », « 30 s », « max », « max en 45 s » (+ « par côté ») : cible affichée dans « Ensuite ». */
export function targetSummary(info: StepInfo): string {
  const side = info.exercise?.unilateral ? ' par côté' : ''
  switch (stepType(info)) {
    case 'amrap':
      return `max${side}`
    case 'timedMax':
      return `max en ${stepWindow(info)} s`
    case 'time': {
      const d = info.set.targetDurationSec ?? info.exercise?.durationRange?.[0]
      return d === undefined ? '' : `${formatSeconds(d)}${side}`
    }
    default:
      return info.set.targetReps ? `${rangeText(info.set.targetReps)} reps${side}` : ''
  }
}

/** Avancement de chaque exercice de la séance (0 à 1, séries faites ou passées) et exercice courant (à partir de 1). */
export function exerciseProgress(
  blocks: readonly SessionBlock[],
  cursor: SessionCursor | null,
): { fractions: number[]; current: number } {
  const fractions: number[] = []
  let current = 0
  blocks.forEach((b, bi) =>
    b.exercises.forEach((e, ei) => {
      const handled = e.sets.filter((s) => s.status !== undefined).length
      fractions.push(e.sets.length === 0 ? 1 : handled / e.sets.length)
      if (cursor !== null && cursor.block === bi && cursor.exercise === ei) current = fractions.length
    }),
  )
  return { fractions, current: current === 0 ? fractions.length : current }
}

/** Séries de l'exercice sous forme de pastilles : faite, en cours, passée, à faire. */
export function dotStates(
  se: SessionExercise,
  currentSet: number,
): ('done' | 'current' | 'todo' | 'skipped')[] {
  return se.sets.map((s, i) =>
    i === currentSet ? 'current' : s.status === 'done' ? 'done' : s.status === 'skipped' ? 'skipped' : 'todo',
  )
}
