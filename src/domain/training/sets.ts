// Séries cibles d'un exercice et drapeaux de contenu (SPEC §3.2 étape 7, §3.3, §9).
// Partagé par la génération, le remplacement, l'ajout manuel et les modèles.
import type { Equipment } from '../../types/profile'
import type { Exercise, ExerciseState, SessionExercise, SetEntry } from '../../types/training'
import { snapLoadDown } from './loads'

/** Tempo proposé quand la charge max est atteinte sans variante (SPEC §3.3). */
export const TEMPO_3_1_1 = '3-1-1'

/** Peut servir de finisher en fin de séance de 60 min (swings, portés) : drapeau `Exercise.finisher`. */
export function isFinisherExercise(ex: Exercise): boolean {
  return ex.finisher === true
}

/**
 * Mouvement balistique (swing). Règle : balistique = exercice `finisher` du schéma `hinge` (il n'y a pas de
 * drapeau dédié : dans le contenu de départ, les seuls finishers `hinge` sont les swings deux mains et une main ;
 * un exercice perso `hinge` marqué `finisher` est donc traité comme un swing). Sert à l'échauffement spécifique
 * (charnières à vide puis swings souples, jamais « sans charge »).
 */
export function isBallistic(ex: Exercise): boolean {
  return isFinisherExercise(ex) && ex.pattern === 'hinge'
}

/**
 * Exercice `kettlebell` en apprentissage sans charge : drapeau `learnUnloaded` et état sans charge
 * (ou pas d'état : `unlockState` le créera sans charge).
 */
export function isLearningUnloaded(ex: Exercise, state: ExerciseState | undefined): boolean {
  return ex.loadType === 'kettlebell' && ex.learnUnloaded === true && (state?.loadKg ?? null) === null
}

/**
 * Séries cibles d'un exercice d'après son état :
 * - répétitions : fourchette de l'exercice ;
 * - durée : durée visée de l'état, bornée à la fourchette (bas de fourchette sans état) ;
 * - charge (kettlebell) : charge de l'état arrondie vers le bas à une charge réglable, plus petite charge réglable
 *   sans état ; aucune charge pour un exercice en apprentissage sans charge (`learnUnloaded`).
 * `count` ≤ 0 → aucune série.
 */
export function buildTargetSets(
  ex: Exercise,
  state: ExerciseState | undefined,
  equipment: Equipment,
  count: number,
): SetEntry[] {
  const entry: SetEntry = {}
  if (ex.repRange !== undefined) entry.targetReps = [ex.repRange[0], ex.repRange[1]]
  else if (ex.durationRange !== undefined) {
    const [lo, hi] = ex.durationRange
    entry.targetDurationSec = Math.min(hi, Math.max(lo, state?.targetDurationSec ?? lo))
  }
  if (ex.loadType === 'kettlebell' && !isLearningUnloaded(ex, state)) {
    const kb = equipment.kettlebell
    entry.loadKg = snapLoadDown(state?.loadKg ?? kb.minKg, kb)
  }
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  return Array.from({ length: n }, () => ({ ...entry }))
}

/**
 * Exercice de séance construit d'après l'état : séries cibles, repos donné (défaut : repos de l'exercice),
 * tempo 3-1-1 si l'état l'a accepté (exercice en répétitions seulement).
 */
export function buildSessionExercise(
  ex: Exercise,
  state: ExerciseState | undefined,
  equipment: Equipment,
  count: number,
  restSec: number = ex.restSec,
): SessionExercise {
  const se: SessionExercise = {
    exerciseId: ex.id,
    restSec,
    sets: buildTargetSets(ex, state, equipment, count),
  }
  if (ex.repRange !== undefined && state?.tempo === true) se.tempo = TEMPO_3_1_1
  return se
}
