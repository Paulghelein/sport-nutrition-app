// Types de séries (v2, F3) : AMRAP (max de répétitions sur la dernière série) et max en temps fixe (finisher).
// Règles d'admissibilité, pose dans une séance, fenêtres et seuils. Fonctions pures.
import type { LocalDate } from '../../types/common'
import type {
  Exercise,
  ExerciseState,
  MuscleGroup,
  Session,
  SessionBlock,
  SessionDuration,
  SessionExercise,
  SetEntry,
  SetType,
} from '../../types/training'
import { daysBetween } from '../shared/dates'
import { isFinisherExercise } from './sets'

/**
 * Type d'une série. Champ absent (séances et sauvegardes antérieures à la v2) : `time` si `targetDurationSec`
 * est présent sans `targetReps`, sinon `reps` — exactement ce que lisaient l'estimation et la progression.
 */
export function setTypeOf(set: SetEntry): SetType {
  if (set.setType !== undefined) return set.setType
  return set.targetDurationSec !== undefined && set.targetReps === undefined ? 'time' : 'reps'
}

/**
 * Fenêtre (secondes) d'une série en temps fixe valide : `setType: 'timedMax'` avec `targetDurationSec` > 0.
 * Une série `timedMax` sans fenêtre (donnée incohérente) est traitée partout comme une série en répétitions
 * normale (`undefined` ici) : jamais de fenêtre 0, jamais de record « en 0 s ».
 */
export function timedMaxWindowOf(set: SetEntry): number | undefined {
  const w = set.targetDurationSec
  return setTypeOf(set) === 'timedMax' && w !== undefined && Number.isFinite(w) && w > 0 ? w : undefined
}

/**
 * AMRAP : nombre de répétitions estimé = haut de la fourchette × 1,3 (estimation de durée), et seuil au-delà
 * duquel la variante du niveau supérieur est proposée (progression).
 */
export const AMRAP_RATIO = 1.3

/**
 * Jours sans nouvelle AMRAP après une AMRAP faite : 1 = pas le jour même ni le lendemain (« < 48 h », même
 * approximation que la fatigue des groupes). Une série à l'échec demande plus de récupération.
 */
export const AMRAP_REST_DAYS = 1

/** Séances déjà faites (ressentis enregistrés) avant qu'une AMRAP soit proposée sur un exercice. */
export const AMRAP_MIN_SESSIONS = 2

/**
 * Fenêtres de série `timedMax` par durée de séance (secondes). Prudent : 30 à 45 s, jamais 60 s à l'effort maximal.
 * La génération ne produit un finisher qu'à 60 min (45 s) ; les fenêtres 20 / 30 / 45 min ne servent qu'aux modèles
 * (`planFromTemplate`) dont la ligne n'a pas de fenêtre valide.
 */
export const TIMED_MAX_WINDOWS: Readonly<Record<SessionDuration, number>> = { 20: 30, 30: 30, 45: 40, 60: 45 }
/** Bornes d'une fenêtre `timedMax` relue d'un modèle (garde-fou contre une faute de frappe). */
export const TIMED_MAX_WINDOW_RANGE: readonly [number, number] = [20, 60]
/** Fenêtre de référence du seuil `timedMax` : haut de la fourchette en 45 s. */
export const TIMED_MAX_REFERENCE_SEC = 45

/** Fenêtre `timedMax` d'une séance de `durationMin` minutes. */
export function timedMaxWindowSec(durationMin: SessionDuration): number {
  return TIMED_MAX_WINDOWS[durationMin]
}

/**
 * Seuil de répétitions d'une série `timedMax` : haut de la fourchette ramené à la fenêtre,
 * `floor(top × fenêtre / 45)`, au moins 1 (ex. swings 12–20 : 20 en 45 s, 13 en 30 s).
 */
export function timedMaxThreshold(top: number, windowSec: number): number {
  return Math.max(1, Math.floor((top * windowSec) / TIMED_MAX_REFERENCE_SEC))
}

/**
 * Exercice qui peut recevoir des séries `timedMax` : finisher (`Exercise.finisher`) en répétitions, bilatéral,
 * hors apprentissage sans charge. Dans le contenu de départ : le swing deux mains. Jamais un unilatéral (swing une
 * main : changer de main dans une fenêtre chronométrée pousse à bâcler le geste) → séries normales.
 */
export function canTimedMax(ex: Exercise): boolean {
  return isFinisherExercise(ex) && ex.repRange !== undefined && !ex.unilateral && ex.learnUnloaded !== true
}

/**
 * Exercice qui peut recevoir une AMRAP sur sa dernière série : drapeau `Exercise.amrap` (opt-in, posé sur les
 * exercices dont l'échec technique reste sûr) ET poids du corps (`loadType: 'bodyweight'`) en répétitions, jamais
 * finisher (balistique) ni `learnUnloaded`. Un exercice perso sans drapeau n'est jamais en AMRAP.
 */
export function canAmrap(ex: Exercise): boolean {
  return (
    ex.amrap === true &&
    ex.loadType === 'bodyweight' &&
    ex.repRange !== undefined &&
    ex.durationRange === undefined &&
    !isFinisherExercise(ex) &&
    ex.learnUnloaded !== true
  )
}

/**
 * Exercice de séance qui peut recevoir une AMRAP sur sa dernière série (règles de prudence) :
 * - exercice admissible (`canAmrap`), hors bloc `finisher` ;
 * - au moins 2 séries (une série normale avant l'échec), pas de tempo imposé (geste lent contrôlé) ;
 * - au moins `AMRAP_MIN_SESSIONS` séances déjà faites (`recentFeelings`), dernier ressenti différent de `hard` ;
 * - aucun groupe primaire fatigué (< 48 h, `fatigued`) : jamais d'échec sur un muscle déjà chargé.
 * Le superset est permis : la dernière série d'un exercice tombe au dernier tour, l'ordre de passage ne change pas
 * et le partenaire travaille d'autres muscles (aucun groupe primaire commun, voir la génération).
 */
export function amrapEligible(
  ex: Exercise,
  se: SessionExercise,
  block: SessionBlock,
  state: ExerciseState | undefined,
  fatigued: ReadonlySet<MuscleGroup> = new Set(),
): boolean {
  return (
    canAmrap(ex) &&
    block.kind !== 'finisher' &&
    se.sets.length >= 2 &&
    se.tempo === undefined &&
    state !== undefined &&
    state.recentFeelings.length >= AMRAP_MIN_SESSIONS &&
    state.recentFeelings.at(-1) !== 'hard' &&
    !ex.muscles.primary.some((g) => fatigued.has(g))
  )
}

/** Une série de l'exercice est une AMRAP. */
export function hasAmrap(se: SessionExercise): boolean {
  return se.sets.some((s) => setTypeOf(s) === 'amrap')
}

/** Dernière série de l'exercice passée en AMRAP (copie ; les autres séries sont inchangées). */
export function withLastSetAmrap(se: SessionExercise): SessionExercise {
  const last = se.sets.length - 1
  return { ...se, sets: se.sets.map((s, i) => (i === last ? { ...s, setType: 'amrap' as const } : s)) }
}

/**
 * Séries d'un finisher en temps fixe : le plus de répétitions en `windowSec` secondes. La fourchette de
 * répétitions est retirée (la cible est la fenêtre), la charge est gardée.
 */
export function asTimedMax(se: SessionExercise, windowSec: number): SessionExercise {
  return {
    ...se,
    sets: se.sets.map((s) => {
      const { targetReps, ...rest } = s
      void targetReps
      return { ...rest, setType: 'timedMax' as const, targetDurationSec: windowSec }
    }),
  }
}

/** Une AMRAP a été faite (série `done`) dans une séance `done` du jour ou des `AMRAP_REST_DAYS` jours précédents. */
export function recentAmrap(sessions: readonly Session[], date: LocalDate): boolean {
  return sessions.some((s) => {
    if (s.status !== 'done') return false
    const d = daysBetween(s.date, date)
    return (
      d >= 0 &&
      d <= AMRAP_REST_DAYS &&
      s.blocks.some((b) =>
        b.exercises.some((e) => e.sets.some((x) => x.status === 'done' && setTypeOf(x) === 'amrap')),
      )
    )
  })
}

/**
 * Une AMRAP peut être proposée dans la séance du jour : pas en deload (semaine de récupération, pas de série à
 * l'échec), et aucune AMRAP faite aujourd'hui ou hier (`recentAmrap`).
 */
export function amrapAllowed(sessions: readonly Session[], date: LocalDate, deload: boolean): boolean {
  return !deload && !recentAmrap(sessions, date)
}

export interface AmrapContext {
  /** Résultat de `amrapAllowed` (calculé une fois par séance). */
  allowed: boolean
  states: ReadonlyMap<string, ExerciseState>
  exercises: ReadonlyMap<string, Exercise>
  /** Groupes chargés lourdement il y a moins de 48 h (`fatiguedGroups`). */
  fatigued: ReadonlySet<MuscleGroup>
}

/**
 * Pose au plus UNE AMRAP dans la séance, sur la dernière série du premier exercice admissible dans l'ordre de la
 * séance (polyarticulaires principaux d'abord : l'exercice au poids du corps le plus important), parmi les
 * exercices `wanted` (défaut : tous). Rien si `ctx.allowed` est faux. Admissibilité : `amrapEligible`.
 * Les AMRAP déjà présentes sont d'abord retirées (série rendue sans type, donc `reps`), puis une seule est
 * reposée : la règle « au plus une par séance » tient toujours. Rend des copies ; blocs inchangés partagés.
 */
export function placeAmrap(
  blocks: readonly SessionBlock[],
  ctx: AmrapContext,
  wanted?: (blockIdx: number, exIdx: number) => boolean,
): SessionBlock[] {
  const cleared = blocks.map((b) =>
    b.exercises.some(hasAmrap)
      ? {
          ...b,
          exercises: b.exercises.map((se) =>
            hasAmrap(se)
              ? {
                  ...se,
                  sets: se.sets.map((x) => {
                    if (x.setType !== 'amrap') return x
                    const { setType, ...rest } = x
                    void setType
                    return rest
                  }),
                }
              : se,
          ),
        }
      : b,
  )
  if (!ctx.allowed) return cleared
  for (const [bi, b] of cleared.entries()) {
    for (const [ei, se] of b.exercises.entries()) {
      if (wanted !== undefined && !wanted(bi, ei)) continue
      const ex = ctx.exercises.get(se.exerciseId)
      if (ex === undefined) continue
      if (!amrapEligible(ex, se, b, ctx.states.get(se.exerciseId), ctx.fatigued)) continue
      const exercises = [...b.exercises]
      exercises[ei] = withLastSetAmrap(se)
      const out = [...cleared]
      out[bi] = { ...b, exercises }
      return out
    }
  }
  return cleared
}
