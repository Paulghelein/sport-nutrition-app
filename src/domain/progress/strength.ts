// Force (SPEC §8) : courbe par exercice, records de l'historique, records d'une période. Fonctions pures.
import type { Id, LocalDate } from '../../types/common'
import type { PersonalRecord } from '../../types/guided'
import type { ExerciseRecords, ExerciseStrength, RecordValue, StrengthPoint } from '../../types/progress'
import type { Exercise, Session, SetEntry } from '../../types/training'
import { timedMaxWindowOf } from '../training/setTypes'
import { compareSessionTime, mergedSets, summarizeSession, tonnageOf } from '../training/summary'

/**
 * Index de la bibliothèque par id. Doit contenir les exercices supprimés (surcharges `deleted`, exercices perso
 * supprimés logiquement) : sinon leur tonnage unilatéral n'est pas doublé et ils sortent du volume.
 */
export type ExercisesById = ReadonlyMap<Id, Exercise>

const isDone = (s: SetEntry): boolean => s.status === 'done'
/**
 * Série en temps fixe (F3, `timedMax`) : ses reps (dans une fenêtre imposée) ne se comparent pas à celles d'une
 * série normale, et sa durée est imposée. Elle compte pour la charge et le tonnage, pas pour les reps ni la durée.
 */
const isPlain = (s: SetEntry): boolean => timedMaxWindowOf(s) === undefined

/** Séances `done` dans l'ordre chronologique (date, `startedAt`, puis id pour un ordre stable). */
function chronologicalDone(sessions: readonly Session[]): Session[] {
  return sessions
    .filter((s) => s.status === 'done')
    .sort((a, b) => compareSessionTime(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

const maxOf = (xs: readonly number[]): number | undefined => (xs.length > 0 ? Math.max(...xs) : undefined)

/** Point d'une séance pour un exercice, ou `undefined` sans série faite. */
function strengthPoint(
  session: Session,
  sets: readonly SetEntry[],
  ex: Exercise | undefined,
): StrengthPoint | undefined {
  const done = sets.filter(isDone)
  if (done.length === 0) return undefined
  // Charge de la courbe : séries normales ; séance faite seulement en temps fixe → charge de ces séries.
  const plain = done.filter(isPlain)
  const loaded = (plain.length > 0 ? plain : done).map((s) => s.loadKg)
  const topLoad = maxOf(loaded.filter((x): x is number => x !== undefined))
  // Sans charge dans la séance, toutes les séries faites sont au poids du corps.
  const atTop = plain.filter((s) => s.loadKg === topLoad)
  const bestReps = maxOf(atTop.map((s) => s.actualReps).filter((x): x is number => x !== undefined))
  const bestDuration = maxOf(
    plain.map((s) => s.actualDurationSec).filter((x): x is number => x !== undefined),
  )
  const point: StrengthPoint = {
    date: session.date,
    sessionId: session.id,
    tonnageKg: done.reduce((a, s) => a + tonnageOf(s, ex), 0),
  }
  if (topLoad !== undefined) point.topLoadKg = topLoad
  if (bestReps !== undefined) point.bestReps = bestReps
  if (bestDuration !== undefined) point.bestDurationSec = bestDuration
  return point
}

interface DatedSet {
  date: LocalDate
  set: SetEntry
}

function recordValue(value: number, date: LocalDate, loadKg?: number): RecordValue {
  const r: RecordValue = { value, date }
  if (loadKg !== undefined) r.loadKg = loadKg
  return r
}

/**
 * Records de l'historique d'un exercice. Les séries sont parcourues dans l'ordre chronologique et un record n'est
 * remplacé que s'il est strictement battu : à égalité, la date la plus ancienne reste.
 * - `load` : charge la plus lourde ;
 * - `reps` : reps max en une série à la charge la plus lourde jamais faite en répétitions (poids du corps si aucune
 *   série chargée) ;
 * - `duration` : durée max en une série, toutes charges confondues (`loadKg` = charge de cette série) ;
 * - `tonnage` : plus gros tonnage d'une séance (> 0).
 * Une valeur nulle (0 rep, 0 s) n'est pas un record.
 * Séries en temps fixe (`timedMax`) : comptent pour `load` et `tonnage` seulement (voir `isPlain`) ; leurs records
 * de reps par fenêtre sont ceux du récapitulatif (`recordsInRange`, `windowSec`).
 */
function historyRecords(sets: readonly DatedSet[], points: readonly StrengthPoint[]): ExerciseRecords {
  const records: ExerciseRecords = {}

  for (const { date, set } of sets) {
    if (set.loadKg !== undefined && set.loadKg > (records.load?.value ?? 0)) {
      records.load = recordValue(set.loadKg, date)
    }
    const d = isPlain(set) ? set.actualDurationSec : undefined
    if (d !== undefined && d > (records.duration?.value ?? 0)) {
      records.duration = recordValue(d, date, set.loadKg)
    }
  }

  const withReps = sets.filter(({ set }) => set.actualReps !== undefined && isPlain(set))
  const repLoad = maxOf(withReps.map(({ set }) => set.loadKg).filter((x): x is number => x !== undefined))
  for (const { date, set } of withReps) {
    const reps = set.actualReps ?? 0
    if (set.loadKg === repLoad && reps > (records.reps?.value ?? 0)) {
      records.reps = recordValue(reps, date, repLoad)
    }
  }

  for (const p of points) {
    if (p.tonnageKg > (records.tonnage?.value ?? 0)) records.tonnage = recordValue(p.tonnageKg, p.date)
  }
  return records
}

/**
 * Progression de force par exercice (SPEC §8) : un point par séance `done` où l'exercice a au moins une série faite
 * (séries fusionnées si l'exercice apparaît dans plusieurs blocs), records de tout l'historique.
 * Tonnage = convention du récapitulatif (`tonnageOf` : kettlebell en répétitions, × 2 en unilatéral). Un exercice
 * absent de `exercisesById` (qui doit contenir les supprimés) est compté d'après la série seule, en bilatéral.
 * Attention : le record `duration` est ici « toutes charges confondues » (meilleure durée de l'historique, avec la
 * charge de cette série dans `loadKg`), alors que le récapitulatif (`summarizeSession`) et `recordsInRange`
 * comptent les records de durée (et de reps) charge par charge. Le record `reps` ne retient que la charge la plus
 * lourde. Les deux vues peuvent donc différer pour un porté chargé dont la charge a augmenté.
 * Tri : dernière date décroissante, puis id croissant.
 */
export function strengthByExercise(
  sessions: readonly Session[],
  exercisesById: ExercisesById,
): ExerciseStrength[] {
  const points = new Map<Id, StrengthPoint[]>()
  const sets = new Map<Id, DatedSet[]>()
  for (const session of chronologicalDone(sessions)) {
    for (const [exerciseId, list] of mergedSets(session)) {
      const point = strengthPoint(session, list, exercisesById.get(exerciseId))
      if (point === undefined) continue
      points.set(exerciseId, [...(points.get(exerciseId) ?? []), point])
      const dated = list.filter(isDone).map((set) => ({ date: session.date, set }))
      sets.set(exerciseId, [...(sets.get(exerciseId) ?? []), ...dated])
    }
  }

  const out: ExerciseStrength[] = []
  for (const [exerciseId, pts] of points) {
    const last = pts[pts.length - 1]
    if (last === undefined) continue
    out.push({
      exerciseId,
      points: pts,
      records: historyRecords(sets.get(exerciseId) ?? [], pts),
      lastPerformedOn: last.date,
    })
  }
  return out.sort((a, b) =>
    a.lastPerformedOn !== b.lastPerformedOn
      ? a.lastPerformedOn < b.lastPerformedOn
        ? 1
        : -1
      : a.exerciseId < b.exerciseId
        ? -1
        : a.exerciseId > b.exerciseId
          ? 1
          : 0,
  )
}

/** Clé de fusion : exercice, type, charge et fenêtre (un record `timedMax` ne fusionne pas avec une série normale). */
const recordKey = (r: PersonalRecord): string =>
  `${r.exerciseId}|${r.kind}|${r.loadKg ?? 'bw'}|${r.windowSec ?? '-'}`

/**
 * Records battus par les séances `done` datées de `from` à `to` inclus, chacune comparée à toutes les séances `done`
 * antérieures (même calcul que le récapitulatif : `summarizeSession`, le premier passage n'est pas un record).
 * `exercisesById` doit contenir les exercices supprimés (tonnage unilatéral × 2).
 * Un même record battu plusieurs fois dans la période (même exercice, type, charge et fenêtre) est fusionné : valeur finale
 * (la meilleure) et `previous` = meilleur d'avant la période. Ordre : première séance qui l'a battu, puis ordre
 * du récapitulatif.
 */
export function recordsInRange(
  sessions: readonly Session[],
  from: LocalDate,
  to: LocalDate,
  exercisesById: ExercisesById,
): PersonalRecord[] {
  const library = [...exercisesById.values()]
  const merged = new Map<string, PersonalRecord>()
  for (const session of chronologicalDone(sessions)) {
    if (session.date < from || session.date > to) continue
    for (const r of summarizeSession(session, library, sessions).records) {
      const key = recordKey(r)
      const seen = merged.get(key)
      if (seen === undefined) merged.set(key, { ...r })
      else if (r.value > seen.value) seen.value = r.value
    }
  }
  return [...merged.values()]
}
