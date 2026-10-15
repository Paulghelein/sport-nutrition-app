// Progression d'un exercice après une séance (SPEC §3.3). Rien n'est appliqué sans l'accord de l'utilisateur
// pour les changements d'exercice : `level_up` et `tempo` ne sont que des suggestions.
import type { IsoDateTime, LocalDate } from '../../types/common'
import type { LoadChange, ProgressionOutcome, ProgressionSuggestion } from '../../types/engine'
import type { Equipment, TrainingLevel } from '../../types/profile'
import type {
  Exercise,
  ExercisePreference,
  ExerciseState,
  LibraryExercise,
  SetEntry,
} from '../../types/training'
import { doneSets, dominantFeeling } from './feeling'
import { isAvailable, sortLibrary } from './library'
import { adjustableLoads, maxLoad, nextLoadDown, nextLoadUp, snapLoadDown } from './loads'

/** Ressentis conservés dans l'état. */
export const MAX_RECENT_FEELINGS = 10
/** Pas de la double progression en durée (gainage, portés), en secondes. */
export const DURATION_STEP_SEC = 5
/** Séances `hard` consécutives qui font baisser la charge d'un palier. */
export const HARD_STREAK_DECREASE = 3
/** Séances consécutives au haut de la fourchette (au maximum de charge ou de durée) avant de suggérer la suite. */
export const LEVEL_UP_STREAK = 2

const EPS = 1e-9

export interface SessionResultParams {
  exercise: Exercise
  /** État avant la séance ; absent si l'exercice n'avait jamais été fait ni débloqué. */
  state: ExerciseState | undefined
  /** L'exercice tel que fait dans la séance (séries `done` avec reps / durée réelles et ressenti). */
  performed: { sets: readonly SetEntry[] }
  equipment: Equipment
  /** Bibliothèque fusionnée, pour trouver la variante du niveau supérieur. */
  library: readonly LibraryExercise[]
  date: LocalDate
  /** Niveau global du profil : borne les suggestions de variante (pas de niveau 3 pour un profil débutant). */
  profileLevel: TrainingLevel
  /** Séance faite en deload : charge et durée inchangées, `topStreak` non incrémenté, ressenti enregistré. */
  deload?: boolean
  /** Horodatage de la mise à jour (`updatedAt`) ; défaut : `${date}T00:00:00.000Z` (le moteur ne lit pas l'horloge). */
  now?: IsoDateTime
}

function defaultNow(date: LocalDate): IsoDateTime {
  return `${date}T00:00:00.000Z`
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

/**
 * État initial d'un exercice débloqué (variante acceptée) ou fait pour la première fois :
 * charge de départ prudente = plus petite charge réglable ; durée visée = bas de la fourchette.
 */
export function unlockState(
  exercise: Exercise,
  equipment: Equipment,
  date: LocalDate,
  now: IsoDateTime = defaultNow(date),
): ExerciseState {
  const state: ExerciseState = {
    exerciseId: exercise.id,
    loadKg: exercise.loadType === 'kettlebell' ? (adjustableLoads(equipment.kettlebell)[0] ?? null) : null,
    recentFeelings: [],
    topStreak: 0,
    updatedAt: now,
  }
  if (exercise.durationRange !== undefined) state.targetDurationSec = exercise.durationRange[0]
  return state
}

function trailingCount<T>(list: readonly T[], value: T): number {
  let n = 0
  for (let i = list.length - 1; i >= 0 && list[i] === value; i--) n++
  return n
}

const PREF_RANK: Record<ExercisePreference, number> = { liked: 0, neutral: 1, disliked: 2, hidden: 3 }

/** Exercices complexes à apprendre d'abord sans charge (la kettlebell minimale est déjà lourde au-dessus de la tête). */
export const LEARN_UNLOADED_IDS: readonly string[] = ['turkish-get-up']

/**
 * Variante du niveau supérieur : même schéma, niveau + 1, disponible, non masquée ; `liked` d'abord.
 * Jamais plus d'un niveau au-dessus du profil : un profil débutant (1) ne se voit jamais proposer de niveau 3
 * (ex. Turkish get-up), même après avoir maîtrisé un exercice de niveau 2.
 */
export function nextLevelVariant(
  exercise: Exercise,
  library: readonly LibraryExercise[],
  equipment: Equipment,
  profileLevel: TrainingLevel,
): LibraryExercise | undefined {
  const variants = sortLibrary(
    library.filter(
      (v) =>
        v.id !== exercise.id &&
        v.pattern === exercise.pattern &&
        v.level === exercise.level + 1 &&
        v.level <= profileLevel + 1 &&
        v.preference !== 'hidden' &&
        !v.deleted &&
        isAvailable(v, equipment),
    ),
  )
  return [...variants].sort((a, b) => PREF_RANK[a.preference] - PREF_RANK[b.preference])[0]
}

/**
 * Applique le résultat d'une séance à un exercice.
 *
 * À appeler UNE SEULE FOIS par exercice et par séance : si l'exercice apparaît dans plusieurs blocs, l'appelant
 * fusionne ses séries avant l'appel. La fonction n'est pas idempotente (ressenti ajouté, `topStreak`
 * incrémenté, charge montée à chaque appel) : la rejouer sur la même séance fausserait l'état.
 *
 * Règles :
 * - ressenti de la séance (`hard` si ≥ la moitié des séries faites sont `hard`) ajouté à `recentFeelings` ;
 * - haut de fourchette atteint sur toutes les séries prévues (faites, reps ≥ max ou durée ≥ visée, charge
 *   ≥ charge prévue) → `topStreak + 1`, sinon 0 ;
 * - 3, 6, 9… séances `hard` consécutives → −1 palier (une seule baisse par série de 3) ;
 * - haut atteint et pas 2 `hard` consécutifs → +1 palier (reps chargées), ou +5 s puis +1 palier avec retour
 *   à la durée minimale (portés), ou +5 s (gainage) ; jamais plus d'un palier ;
 * - au maximum (charge, durée ou poids du corps), `topStreak ≥ 2` et pas 2 `hard` consécutifs → suggestion
 *   `level_up` (au plus profil + 1), sinon `tempo` ;
 * - séance en deload (`deload: true`) : ressenti enregistré, charge et durée inchangées, `topStreak` conservé,
 *   aucune suggestion.
 * Si aucune série n'a été faite, l'état est rendu tel quel (`change: 'none'`).
 */
export function applySessionResult(params: SessionResultParams): ProgressionOutcome {
  const { exercise, equipment, library, date, profileLevel } = params
  const deload = params.deload === true
  const now = params.now ?? defaultNow(date)
  const kb = equipment.kettlebell
  const base = params.state ?? unlockState(exercise, equipment, date, now)
  const done = doneSets(params.performed.sets)
  if (done.length === 0) return { state: base, change: 'none' }

  const loaded = exercise.loadType === 'kettlebell'
  const range = exercise.durationRange
  const reps = exercise.repRange
  const currentLoad = loaded ? snapLoadDown(base.loadKg ?? kb.minKg, kb) : null
  const currentDuration =
    range !== undefined ? clamp(base.targetDurationSec ?? range[0], range[0], range[1]) : undefined

  // Ressenti et séries de hard.
  const feeling = dominantFeeling(done)
  const feelings = [...base.recentFeelings, feeling]
  const trailingHard = trailingCount(feelings, 'hard')
  const twoHard = trailingHard >= 2
  const decreaseDue = trailingHard >= HARD_STREAK_DECREASE && trailingHard % HARD_STREAK_DECREASE === 0

  // Haut de fourchette sur toutes les séries prévues.
  const reachedTop = (set: SetEntry): boolean => {
    if (set.status !== 'done') return false
    if (currentLoad !== null && set.loadKg !== undefined && set.loadKg < currentLoad - EPS) return false
    if (reps !== undefined) {
      const top = set.targetReps?.[1] ?? reps[1]
      return set.actualReps !== undefined && set.actualReps >= top
    }
    const top = set.targetDurationSec ?? currentDuration
    return top !== undefined && set.actualDurationSec !== undefined && set.actualDurationSec >= top
  }
  const topReached = params.performed.sets.length > 0 && params.performed.sets.every(reachedTop)
  let streak = deload ? (base.topStreak ?? 0) : topReached ? (base.topStreak ?? 0) + 1 : 0

  let load = currentLoad
  let duration = currentDuration
  let change: LoadChange = loaded || range !== undefined ? 'hold' : 'none'

  if (deload) {
    // Semaine allégée : on ne juge pas la progression sur un volume réduit.
  } else if (decreaseDue) {
    const down = load !== null ? nextLoadDown(load, exercise.loadStepKg, kb) : null
    if (down !== null) {
      load = down
      change = 'decrease'
    } else if (range !== undefined && duration !== undefined && duration > range[0]) {
      // Gainage, ou porté déjà au minimum de la kettlebell : on réduit la durée visée.
      duration = Math.max(range[0], duration - DURATION_STEP_SEC)
      change = 'decrease'
    }
    if (change === 'decrease') streak = 0
  } else if (topReached && !twoHard) {
    if (range !== undefined && duration !== undefined) {
      if (duration < range[1]) {
        duration = Math.min(range[1], duration + DURATION_STEP_SEC)
        change = 'increase'
      } else if (load !== null) {
        const up = nextLoadUp(load, exercise.loadStepKg, kb)
        if (up !== null) {
          load = up
          duration = range[0]
          change = 'increase'
        }
      }
    } else if (load !== null) {
      const up = nextLoadUp(load, exercise.loadStepKg, kb)
      if (up !== null) {
        load = up
        change = 'increase'
      }
    }
    if (change === 'increase') streak = 0
  }

  const state: ExerciseState = {
    ...base,
    loadKg: load,
    recentFeelings: feelings.slice(-MAX_RECENT_FEELINGS),
    topStreak: streak,
    lastPerformedOn: date,
    updatedAt: now,
  }
  if (duration !== undefined) state.targetDurationSec = duration
  else delete state.targetDurationSec

  // Suggestion : au maximum de ce que l'exercice permet, deux séances de suite au haut de la fourchette.
  const loadAtMax = load === null || load >= maxLoad(kb) - EPS
  const durationAtMax = range === undefined || (duration !== undefined && duration >= range[1])
  let suggestion: ProgressionSuggestion | undefined
  if (
    !deload &&
    !twoHard &&
    change !== 'decrease' &&
    loadAtMax &&
    durationAtMax &&
    streak >= LEVEL_UP_STREAK
  ) {
    const variant = nextLevelVariant(exercise, library, equipment, profileLevel)
    if (variant !== undefined) {
      const unloaded = LEARN_UNLOADED_IDS.includes(variant.id)
        ? ' Apprends-le d’abord sans charge (une chaussure posée sur le poing), puis avec la kettlebell la plus légère.'
        : ''
      suggestion = {
        kind: 'level_up',
        exerciseId: exercise.id,
        toExerciseId: variant.id,
        message: `Objectif atteint sur « ${exercise.name} » ${streak} séances de suite : tu peux passer à « ${variant.name} » (niveau ${variant.level}).${unloaded}`,
      }
    } else if (reps !== undefined && base.tempo !== true) {
      // Le tempo n'a de sens qu'en répétitions (pas pour une tenue ou un porté).
      suggestion = {
        kind: 'tempo',
        exerciseId: exercise.id,
        message: `Tu as atteint le maximum sur « ${exercise.name} » : passe au tempo 3-1-1 (3 s en descente, 1 s de pause, 1 s en montée) pour continuer à progresser.`,
      }
    }
  }

  return suggestion === undefined ? { state, change } : { state, change, suggestion }
}
