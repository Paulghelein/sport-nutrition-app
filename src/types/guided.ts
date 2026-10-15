// Séance guidée, récapitulatif et historique (SPEC §3.4, §3.6). Contrats des fonctions pures de
// src/domain/training/ (guided.ts, summary.ts, completion.ts) utilisées par src/app/training/ et src/db/sessions.ts.
import type { Id, IsoDateTime, LocalDate } from './common'
import type { MuscleVolume, ProgressionOutcome } from './engine'
import type { Feeling, Session, SessionCursor, SessionSuggestion, ExerciseState } from './training'

/**
 * Ordre de passage :
 * - bloc `single` / `finisher` : toutes les séries de l'exercice, dans l'ordre ;
 * - bloc `superset` : tour par tour (série 1 de A, série 1 de B, série 2 de A…) ; un exercice qui a moins de
 *   séries est sauté dans les tours suivants.
 * Les séries déjà `done` ou `skipped` sont sautées.
 */
export type GuidedStep =
  | { kind: 'set'; cursor: SessionCursor }
  /** Toutes les séries sont faites ou passées : afficher « Terminer la séance ». */
  | { kind: 'finished' }

/**
 * Repos à lancer après une série :
 * - `set` : entre deux séries du même exercice (`SessionExercise.restSec`) ;
 * - `transition` : entre deux exercices d'un même tour de superset (`SUPERSET_TRANSITION_SEC`) ;
 * - `round` : après le dernier exercice d'un tour de superset (repos du bloc = le plus long des exercices) ;
 * - `block` : avant le bloc suivant (repos de l'exercice qui vient d'être fait) ;
 * - `none` : dernière série de la séance.
 */
export interface RestPlan {
  kind: 'set' | 'transition' | 'round' | 'block' | 'none'
  seconds: number
}

/** Saisie de l'utilisateur à la fin d'une série. Exactement un de `reps` / `durationSec` selon la cible. */
export interface SetInput {
  reps?: number
  durationSec?: number
  /** Charge réellement utilisée (kettlebell), si différente de la charge prévue. */
  loadKg?: number
  feeling: Feeling
}

/** Record battu pendant une séance, par rapport à toutes les séances `done` antérieures. */
export interface PersonalRecord {
  exerciseId: Id
  /**
   * - `load` : charge la plus lourde jamais faite sur cet exercice (au moins une série `done`) ;
   * - `reps` : plus de répétitions en une série à une charge donnée (`loadKg`, absent = poids du corps) ;
   * - `duration` : plus longue durée tenue en une série à une charge donnée ;
   * - `tonnage` : plus gros tonnage (charge × reps, séries faites) de l'exercice en une séance.
   * Le premier passage sur un exercice ne crée pas de record (rien à battre).
   */
  kind: 'load' | 'reps' | 'duration' | 'tonnage'
  value: number
  previous: number
  loadKg?: number
}

/** Bilan d'un exercice dans le récapitulatif (séries fusionnées si l'exercice apparaît dans plusieurs blocs). */
export interface ExerciseSummary {
  exerciseId: Id
  setsDone: number
  setsSkipped: number
  totalReps: number
  totalDurationSec: number
  /** Somme charge × reps des séries faites (kettlebell en répétitions uniquement). */
  tonnageKg: number
  /** Charge la plus lourde des séries faites. */
  topLoadKg?: number
}

/** Récapitulatif d'une séance (`done` ou en cours de correction). */
export interface SessionSummary {
  /** Durée réelle (`endedAt` − `startedAt`), arrondie à la minute ; absente si un horodatage manque. */
  actualMin?: number
  setsDone: number
  setsSkipped: number
  totalReps: number
  tonnageKg: number
  /** Séries effectives par groupe (primaire 1, secondaire 0,5), séries faites seulement. */
  volume: MuscleVolume
  exercises: ExerciseSummary[]
  records: PersonalRecord[]
}

/**
 * Résultat du calcul de fin de séance (fonction pure `completeSessionPlan`), écrit en une transaction par
 * `completeSession` (src/db/sessions.ts) : séance `done` + états de progression.
 */
export interface SessionCompletion {
  session: Session
  /** Un résultat par exercice distinct ayant au moins une série faite (`applySessionResult` appelée une fois). */
  outcomes: ProgressionOutcome[]
  /** États à enregistrer (= `outcomes[].state`). */
  states: ExerciseState[]
  suggestions: SessionSuggestion[]
}

/** Ligne de l'historique des séances. */
export interface SessionHistoryItem {
  id: Id
  date: LocalDate
  status: Session['status']
  durationMin: Session['durationMin']
  actualMin?: number
  setsDone: number
  /** Noms ou ids des exercices faits, dans l'ordre (l'UI résout les noms). */
  exerciseIds: Id[]
  startedAt?: IsoDateTime
}
