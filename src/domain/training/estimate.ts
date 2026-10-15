// Estimation de la durée d'une séance (SPEC §3.2 étape 3).
//
// Modèle (secondes) :
// - travail d'une série = répétitions × 3 s (milieu de la fourchette visée) ou durée visée ; × 2 si unilatéral
//   (en tempo imposé, ex. `'3-1-1'`, une répétition dure la somme des phases : 5 s)
//   (une série complète de chaque côté) ;
// - bloc simple ou finisher : par exercice, 60 s d'installation (régler la kettlebell, se placer),
//   puis pour chaque série : travail + repos (`restSec`) ;
// - superset : 60 s d'installation par exercice ; par tour, travail de chaque exercice + 20 s d'enchaînement
//   entre deux exercices (poser, changer de charge) + un seul repos après le tour, égal au plus long `restSec`
//   des exercices du bloc ;
// - les séries `skipped` ne comptent pas ; le repos après la toute dernière série est compté (rangement, transition).
import type { Exercise, SessionBlock, SessionExercise, SetEntry } from '../../types/training'

export const SECONDS_PER_REP = 3
export const SETUP_SEC = 60
export const SUPERSET_TRANSITION_SEC = 20

function activeSets(se: SessionExercise): SetEntry[] {
  return se.sets.filter((s) => s.status !== 'skipped')
}

/** Secondes par répétition : somme des phases d'un tempo `'3-1-1'` (5 s), sinon 3 s. Tempo illisible → 3 s. */
export function secondsPerRep(tempo: string | undefined): number {
  if (tempo === undefined) return SECONDS_PER_REP
  const parts = tempo.split('-').map((x) => Number(x))
  if (parts.length === 0 || parts.some((x) => !Number.isFinite(x) || x < 0)) return SECONDS_PER_REP
  const sum = parts.reduce((a, b) => a + b, 0)
  return sum > 0 ? sum : SECONDS_PER_REP
}

/** Travail d'une série en secondes (sans repos). Exercice inconnu → bilatéral, cible de la série seule. */
export function setWorkSeconds(set: SetEntry, ex: Exercise | undefined, tempo?: string): number {
  const perRep = secondsPerRep(tempo)
  let base: number
  if (set.targetReps !== undefined) base = ((set.targetReps[0] + set.targetReps[1]) / 2) * perRep
  else if (set.targetDurationSec !== undefined) base = set.targetDurationSec
  else if (ex?.repRange !== undefined) base = ((ex.repRange[0] + ex.repRange[1]) / 2) * perRep
  else if (ex?.durationRange !== undefined) base = ex.durationRange[0]
  else base = 30
  return ex?.unilateral === true ? base * 2 : base
}

/** Durée d'un bloc en secondes selon le modèle ci-dessus. */
export function blockSeconds(block: SessionBlock, index: ReadonlyMap<string, Exercise>): number {
  if (block.kind !== 'superset') {
    let total = 0
    for (const se of block.exercises) {
      const ex = index.get(se.exerciseId)
      total += SETUP_SEC
      for (const set of activeSets(se)) total += setWorkSeconds(set, ex, se.tempo) + se.restSec
    }
    return total
  }
  const members = block.exercises.map((se) => ({ se, ex: index.get(se.exerciseId), sets: activeSets(se) }))
  const rounds = Math.max(0, ...members.map((m) => m.sets.length))
  const roundRest = Math.max(0, ...members.map((m) => m.se.restSec))
  let total = SETUP_SEC * members.length
  for (let r = 0; r < rounds; r++) {
    const inRound = members.filter((m) => m.sets[r] !== undefined)
    for (const m of inRound) total += setWorkSeconds(m.sets[r] as SetEntry, m.ex, m.se.tempo)
    total += Math.max(0, inRound.length - 1) * SUPERSET_TRANSITION_SEC + roundRest
  }
  return total
}

/** Durée totale en secondes, échauffement compris. */
export function estimateSeconds(
  blocks: readonly SessionBlock[],
  library: readonly Exercise[],
  warmupMin: number,
): number {
  const index = new Map(library.map((e) => [e.id, e]))
  return warmupMin * 60 + blocks.reduce((acc, b) => acc + blockSeconds(b, index), 0)
}

/** Durée totale estimée en minutes (arrondie), échauffement compris. Sert aussi après une édition (J4). */
export function estimateMinutes(
  blocks: readonly SessionBlock[],
  library: readonly Exercise[],
  warmupMin: number,
): number {
  return Math.round(estimateSeconds(blocks, library, warmupMin) / 60)
}
