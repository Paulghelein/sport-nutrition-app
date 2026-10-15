// Ressenti dominant d'un ensemble de séries (SPEC §3.3).
import type { Feeling, SetEntry } from '../../types/training'

/** Séries faites (`status: 'done'`). */
export function doneSets(sets: readonly SetEntry[]): SetEntry[] {
  return sets.filter((s) => s.status === 'done')
}

/**
 * Ressenti dominant des séries données (on passe les séries faites) :
 * `hard` si au moins la moitié sont `hard` ; sinon `easy` si plus de la moitié sont `easy` ; sinon `ok`.
 * Une série sans ressenti compte comme `ok`. Aucune série → `ok`.
 */
export function dominantFeeling(sets: readonly SetEntry[]): Feeling {
  const n = sets.length
  if (n === 0) return 'ok'
  const hard = sets.filter((s) => s.feeling === 'hard').length
  const easy = sets.filter((s) => s.feeling === 'easy').length
  if (hard * 2 >= n) return 'hard'
  if (easy * 2 > n) return 'easy'
  return 'ok'
}
