// Outils de test du moteur (non exportés par index.ts) : fixtures et simulation de séances.
import { seedExercises } from '../../content'
import type { LocalDate } from '../../types/common'
import type { EngineInput, SessionPlan } from '../../types/engine'
import type { Equipment, EquipmentId, TrainingLevel } from '../../types/profile'
import type { EngineSettings } from '../../types/settings'
import type {
  Exercise,
  ExercisePref,
  ExercisePreference,
  ExerciseState,
  Feeling,
  LibraryExercise,
  Session,
  SessionBlock,
  SessionDuration,
  SessionExercise,
} from '../../types/training'
import { mergeLibrary } from './library'

export const T0 = '2026-10-15T08:00:00.000Z'

export function makeEquipment(
  owned: EquipmentId[] = ['mat'],
  kettlebell: Equipment['kettlebell'] = { minKg: 12, maxKg: 24, stepKg: 1 },
): Equipment {
  return { id: 'me', kettlebell, owned, updatedAt: T0 }
}

export const defaultSettings = (over: Partial<EngineSettings> = {}): EngineSettings => ({
  volumeTargets: {},
  deloadEveryWeeks: 6,
  ...over,
})

export function seedLibrary(prefs: Record<string, ExercisePreference> = {}): LibraryExercise[] {
  const rows: ExercisePref[] = Object.entries(prefs).map(([exerciseId, preference]) => ({
    exerciseId,
    preference,
    updatedAt: T0,
  }))
  return mergeLibrary(seedExercises, [], rows)
}

export function byId(library: readonly Exercise[], id: string): LibraryExercise {
  const ex = library.find((e) => e.id === id)
  if (ex === undefined) throw new Error(`exercice inconnu : ${id}`)
  return ex as LibraryExercise
}

export function makeInput(over: Partial<EngineInput> = {}): EngineInput {
  return {
    date: '2026-10-15',
    durationMin: 30,
    profileLevel: 1 as TrainingLevel,
    equipment: makeEquipment(),
    library: seedLibrary(),
    states: [],
    sessions: [],
    settings: defaultSettings(),
    ...over,
  }
}

export const makeState = (exerciseId: string, over: Partial<ExerciseState> = {}): ExerciseState => ({
  exerciseId,
  loadKg: null,
  recentFeelings: [],
  topStreak: 0,
  updatedAt: T0,
  ...over,
})

/** Séance `done` faite de blocs simples : `[exerciseId, séries faites, ressenti]`. */
export function doneSession(
  date: LocalDate,
  items: readonly (readonly [string, number] | readonly [string, number, Feeling])[],
  over: Partial<Session> = {},
): Session {
  const blocks: SessionBlock[] = items.map(([exerciseId, n, feeling], i) => ({
    id: `b${i + 1}`,
    kind: 'single',
    exercises: [
      {
        exerciseId,
        restSec: 60,
        sets: Array.from({ length: n }, () => ({
          status: 'done' as const,
          feeling: feeling ?? 'ok',
          actualReps: 10,
        })),
      },
    ],
  }))
  return {
    id: `s-${date}-${items.map((x) => x[0]).join('-')}`,
    date,
    durationMin: 30,
    status: 'done',
    warmup: [],
    blocks,
    deload: false,
    estimatedMin: 30,
    updatedAt: T0,
    ...over,
  }
}

/** Transforme un plan en séance `done` : toutes les séries faites au haut de la fourchette avec le ressenti donné. */
export function completePlan(plan: SessionPlan, id: string, feeling: Feeling = 'ok'): Session {
  return {
    id,
    date: plan.date,
    durationMin: plan.durationMin,
    status: 'done',
    warmup: plan.warmup,
    blocks: plan.blocks.map((b) => ({
      ...b,
      exercises: b.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({
          ...s,
          status: 'done' as const,
          feeling,
          ...(s.targetReps !== undefined ? { actualReps: s.targetReps[1] } : {}),
          ...(s.targetDurationSec !== undefined ? { actualDurationSec: s.targetDurationSec } : {}),
        })),
      })),
    })),
    deload: plan.deload,
    estimatedMin: plan.estimatedMin,
    updatedAt: T0,
  }
}

export const DURATIONS: readonly SessionDuration[] = [20, 30, 45, 60]

export function planExerciseIds(plan: SessionPlan): string[] {
  return plan.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId))
}

/** Valeur présente (tests) : lève une erreur si `undefined` (remplace l'assertion non nulle `!`, interdite). */
export function must<T>(x: T | undefined): T {
  if (x === undefined) throw new Error('valeur absente')
  return x
}

/** Exercice `e` du bloc `b` d'une séance ou d'une liste de blocs (tests). */
export function exAt(
  target: { blocks: readonly SessionBlock[] } | readonly SessionBlock[],
  b: number,
  e: number,
): SessionExercise {
  const blocks = 'blocks' in target ? target.blocks : target
  return must(blocks[b]?.exercises[e])
}
