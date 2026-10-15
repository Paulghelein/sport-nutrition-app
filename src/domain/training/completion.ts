// Fin de séance : progression appliquée une seule fois, suggestions à accepter (SPEC §3.3, §3.4).
import type { IsoDateTime, LocalDate } from '../../types/common'
import type { ProgressionOutcome } from '../../types/engine'
import type { SessionCompletion } from '../../types/guided'
import type { Equipment, TrainingLevel } from '../../types/profile'
import type { ExerciseState, LibraryExercise, Session, SessionSuggestion } from '../../types/training'
import { patternLevels } from './levels'
import { isAvailable } from './library'
import { applySessionResult, unlockState } from './progression'
import { mergedSets } from './summary'

export interface CompleteSessionParams {
  session: Session
  /** Bibliothèque fusionnée (variantes, niveau atteint). */
  library: readonly LibraryExercise[]
  /** États actuels de tous les exercices. */
  states: readonly ExerciseState[]
  equipment: Equipment
  profileLevel: TrainingLevel
  now: IsoDateTime
}

function finalize(session: Session, now: IsoDateTime): Session {
  const { cursor, restEndsAt, ...rest } = session
  void [cursor, restEndsAt]
  return {
    ...rest,
    status: 'done',
    endedAt: session.endedAt ?? now,
    // Séries jamais faites quand on termine : passées (le récapitulatif et la progression les voient ainsi).
    blocks: session.blocks.map((b) => ({
      ...b,
      exercises: b.exercises.map((se) => ({
        ...se,
        sets: se.sets.map((s) => (s.status === undefined ? { ...s, status: 'skipped' as const } : s)),
      })),
    })),
    updatedAt: now,
  }
}

/**
 * Termine une séance (« Terminer ») et calcule la progression, écrite ensuite en une transaction par la couche
 * données :
 * - séries encore à faire → `skipped` ; statut `done`, `endedAt = now`, `progressionAppliedAt = now`, sans
 *   `cursor` ni `restEndsAt` ;
 * - séries de chaque exercice fusionnées sur tous les blocs, `applySessionResult` appelée UNE fois par exercice
 *   ayant au moins une série faite (`deload: session.deload`, `profileLevel`, date = `session.date`, `now`) ;
 * - suggestions des résultats → `SessionSuggestion` `pending` (une seule par exercice cible) ; une `level_up`
 *   vers une variante qui a déjà un état est retirée (aussi de `outcomes`), sinon elle reviendrait à chaque séance.
 * Garde de niveau : un exercice sans état dont le niveau dépasse le niveau atteint du schéma (ajouté autrement que
 * par `addCandidates`, profil abaissé…) ne reçoit pas d'état : son passage ne débloque pas le niveau
 * implicitement (seule `acceptSuggestion` le fait). Exercice absent de la bibliothèque : ignoré.
 * Séance déjà appliquée (`progressionAppliedAt` présent) : rien n'est rejoué (outcomes et états vides).
 */
export function completeSessionPlan(params: CompleteSessionParams): SessionCompletion {
  const { library, states, equipment, profileLevel, now } = params
  const session = finalize(params.session, now)
  if (params.session.progressionAppliedAt !== undefined) {
    return { session, outcomes: [], states: [], suggestions: session.suggestions ?? [] }
  }

  const index = new Map(library.map((e) => [e.id, e]))
  const stateById = new Map(states.map((s) => [s.exerciseId, s]))
  const levels = patternLevels(library, states, profileLevel)
  const outcomes: ProgressionOutcome[] = []
  for (const [exerciseId, sets] of mergedSets(session)) {
    const exercise = index.get(exerciseId)
    if (exercise === undefined || !sets.some((s) => s.status === 'done')) continue
    const state = stateById.get(exerciseId)
    if (state === undefined && exercise.level > levels[exercise.pattern]) continue
    outcomes.push(
      applySessionResult({
        exercise,
        state,
        performed: { sets },
        equipment,
        library,
        date: session.date,
        profileLevel,
        deload: session.deload,
        now,
      }),
    )
  }

  const suggestions: SessionSuggestion[] = []
  for (const [i, o] of outcomes.entries()) {
    const s = o.suggestion
    if (s === undefined) continue
    // Variante déjà débloquée (état existant) : la suggestion reviendrait à chaque séance → retirée.
    if (s.kind === 'level_up' && s.toExerciseId !== undefined && stateById.has(s.toExerciseId)) {
      const { suggestion, ...rest } = o
      void suggestion
      outcomes[i] = rest
      continue
    }
    if (s.kind === 'level_up' && suggestions.some((x) => x.toExerciseId === s.toExerciseId)) continue
    const suggestion: SessionSuggestion = {
      kind: s.kind,
      exerciseId: s.exerciseId,
      message: s.message,
      status: 'pending',
    }
    if (s.toExerciseId !== undefined) suggestion.toExerciseId = s.toExerciseId
    suggestions.push(suggestion)
  }

  const done: Session = { ...session, progressionAppliedAt: now, suggestions }
  return { session: done, outcomes, states: outcomes.map((o) => o.state), suggestions }
}

export interface AcceptSuggestionParams {
  library: readonly LibraryExercise[]
  states: readonly ExerciseState[]
  equipment: Equipment
  date: LocalDate
  now: IsoDateTime
}

/**
 * État à enregistrer quand l'utilisateur accepte une suggestion (`pending` seulement) :
 * - `level_up` : état initial de la variante (`unlockState` : charge minimale, ou sans charge pour un exercice
 *   `learnUnloaded`) ; `undefined` si la variante a déjà un état, n'existe plus, est supprimée, masquée ou
 *   indisponible avec le matériel actuel (revérifié : le matériel ou les préférences ont pu changer) ;
 * - `tempo` : état existant avec `tempo: true` ; `undefined` sans état.
 * Le statut de la suggestion (`accepted`) est posé par l'appelant sur la séance.
 */
export function acceptSuggestion(
  suggestion: SessionSuggestion,
  params: AcceptSuggestionParams,
): ExerciseState | undefined {
  if (suggestion.status !== 'pending') return undefined
  if (suggestion.kind === 'level_up') {
    const id = suggestion.toExerciseId
    if (id === undefined || params.states.some((s) => s.exerciseId === id)) return undefined
    const target = params.library.find((e) => e.id === id)
    if (
      target === undefined ||
      target.deleted === true ||
      target.preference === 'hidden' ||
      !isAvailable(target, params.equipment)
    ) {
      return undefined
    }
    return unlockState(target, params.equipment, params.date, params.now)
  }
  const state = params.states.find((s) => s.exerciseId === suggestion.exerciseId)
  return state === undefined ? undefined : { ...state, tempo: true, updatedAt: params.now }
}
