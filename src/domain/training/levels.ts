// Niveau atteint par schéma de mouvement (SPEC §3.3, ExerciseState).
import type { PatternLevels } from '../../types/engine'
import type { TrainingLevel } from '../../types/profile'
import type { Exercise, ExerciseState } from '../../types/training'
import { PATTERN_ORDER } from './library'

/**
 * Par schéma : max(niveau du profil, plus haut niveau parmi les exercices du schéma qui ont un état).
 * Un état dont l'exercice n'est pas dans la bibliothèque est ignoré.
 * Conséquence : un exercice de niveau 3 (ex. Turkish get-up) n'est jamais proposé à un débutant tant
 * qu'aucun exercice de niveau 3 de ce schéma n'a été débloqué.
 */
export function patternLevels(
  library: readonly Exercise[],
  states: readonly ExerciseState[],
  profileLevel: TrainingLevel,
): PatternLevels {
  const levels = {} as PatternLevels
  for (const p of PATTERN_ORDER) levels[p] = profileLevel
  const withState = new Set(states.map((s) => s.exerciseId))
  for (const ex of library) {
    if (withState.has(ex.id) && ex.level > levels[ex.pattern]) levels[ex.pattern] = ex.level
  }
  return levels
}
