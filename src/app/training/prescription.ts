// Textes de prescription (aperçu, repos, historique) : mise en forme seulement. Le type d'une série se lit toujours via
// `setTypeOf` / `timedMaxWindowOf` (jamais d'après la seule présence de `targetDurationSec`).
import { setTypeOf, timedMaxWindowOf, tonnageOf } from '../../domain/training'
import type { LibraryExercise, Range, Session, SessionBlock, SetEntry, SessionExercise } from '../../types'
import { formatSeconds, kgText } from './format'

/** « 8–12 » ou « 10 » (tiret demi-cadratin, comme sur les maquettes). */
export function rangeText(r: Range): string {
  return r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`
}

/**
 * Type d'une série tel que l'interface le traite. `timedMax` sans fenêtre valide (donnée incohérente) redevient une
 * série en répétitions, comme partout dans le moteur ; une cible absente sur un exercice en durée est une série `time`.
 */
export function effectiveType(
  set: SetEntry,
  exercise?: { durationRange?: Range },
): 'reps' | 'time' | 'amrap' | 'timedMax' {
  const type = setTypeOf(set)
  if (type === 'timedMax') return timedMaxWindowOf(set) === undefined ? 'reps' : 'timedMax'
  if (
    type === 'reps' &&
    set.setType === undefined &&
    set.targetReps === undefined &&
    exercise?.durationRange !== undefined
  )
    return 'time'
  return type
}

export interface ExerciseText {
  /** « 3 × 15 », « 4 × 8–12 », « 3 × 40 s », « 2 × max en 45 s ». */
  summary: string
  /** Suite lisible : charge, côté, dernière série max, tempo, repos. */
  details: string[]
  /** Charge de la première série (kg), pour comparer à la dernière séance. */
  loadKg: number | undefined
}

/** Prescription d'un exercice de séance, d'après sa première série (les séries sont identiques, sauf la dernière si max). */
export function exerciseText(
  se: SessionExercise,
  ex: LibraryExercise | undefined,
  opts: { showRest?: boolean } = {},
): ExerciseText {
  const n = se.sets.length
  const first = se.sets[0]
  const details: string[] = []
  let summary = `${n} séries`
  if (first) {
    const type = effectiveType(first, ex)
    if (type === 'timedMax') summary = `${n} × max en ${timedMaxWindowOf(first)} s`
    else if (type === 'time' && first.targetDurationSec !== undefined)
      summary = `${n} × ${first.targetDurationSec} s`
    else if (first.targetReps) summary = `${n} × ${rangeText(first.targetReps)}`
    else if (ex?.durationRange) summary = `${n} × ${ex.durationRange[0]} s`
    else if (ex?.repRange) summary = `${n} × ${rangeText(ex.repRange)}`
  }
  const loadKg = first?.loadKg
  if (loadKg !== undefined) details.push(`${kgText(loadKg)} kg`)
  if (ex?.unilateral) details.push('chaque côté')
  if (se.sets.some((s) => setTypeOf(s) === 'amrap')) details.push('dernière série : max')
  if (se.tempo) details.push(`tempo ${se.tempo}`)
  if (opts.showRest) details.push(`repos ${formatSeconds(se.restSec)}`)
  return { summary, details, loadKg }
}

/**
 * Dernière charge utilisée pour un exercice dans une séance terminée (série faite, charge réelle), la plus récente
 * d'abord ; `undefined` si jamais fait avec une charge. Sert à afficher « +1 kg » (aucune règle de progression ici).
 */
export function lastLoadKg(sessions: readonly Session[], exerciseId: string): number | undefined {
  let best: { date: string; kg: number } | undefined
  for (const s of sessions) {
    if (s.status !== 'done') continue
    for (const b of s.blocks)
      for (const e of b.exercises) {
        if (e.exerciseId !== exerciseId) continue
        const kg = [...e.sets].reverse().find((x) => x.status === 'done' && x.loadKg !== undefined)?.loadKg
        if (kg === undefined) continue
        const when = s.endedAt ?? s.startedAt ?? s.date
        if (best === undefined || when >= best.date) best = { date: when, kg }
      }
  }
  return best?.kg
}

/** Hausse de charge par rapport à la dernière séance : « +1 kg », sinon `undefined`. */
export function loadIncrease(loadKg: number | undefined, lastKg: number | undefined): string | undefined {
  if (loadKg === undefined || lastKg === undefined || loadKg <= lastKg) return undefined
  return `+${kgText(Math.round((loadKg - lastKg) * 100) / 100)} kg`
}

/** « 18 kg × 10 », « 40 s », « max : 14 reps », « 24 reps en 45 s » : résultat d'une série faite. */
export function doneText(set: SetEntry, ex?: { durationRange?: Range }): string {
  const type = effectiveType(set, ex)
  const load = set.loadKg !== undefined ? `${kgText(set.loadKg)} kg` : undefined
  let main: string
  if (type === 'time') main = formatSeconds(set.actualDurationSec ?? set.targetDurationSec ?? 0)
  else if (type === 'timedMax') main = `${set.actualReps ?? 0} reps en ${timedMaxWindowOf(set)} s`
  else if (type === 'amrap') main = `max : ${set.actualReps ?? 0} reps`
  else main = load !== undefined ? `${set.actualReps ?? 0}` : `${set.actualReps ?? 0} reps`
  if (load === undefined) return main
  return type === 'reps' ? `${load} × ${main}` : `${load} · ${main}`
}

/** Nombre de séries et volume prévu (kg, charge × reps moyennes de la fourchette ; 0 pour poids du corps et temps fixe). */
export function plannedTotals(
  blocks: readonly SessionBlock[],
  byId: ReadonlyMap<string, LibraryExercise>,
): { sets: number; tonnageKg: number } {
  let sets = 0
  let tonnageKg = 0
  for (const b of blocks)
    for (const e of b.exercises) {
      const ex = byId.get(e.exerciseId)
      for (const s of e.sets) {
        sets++
        if (s.targetReps === undefined) continue
        const reps = Math.round((s.targetReps[0] + s.targetReps[1]) / 2)
        tonnageKg += tonnageOf({ ...s, status: 'done', actualReps: reps }, ex)
      }
    }
  return { sets, tonnageKg: Math.round(tonnageKg) }
}
