// Récapitulatif de séance, records et historique (SPEC §3.4, §3.6). Fonctions pures.
import type { ExerciseSummary, PersonalRecord, SessionHistoryItem, SessionSummary } from '../../types/guided'
import type { Exercise, Id, Session, SetEntry } from '../../types'
import { addExerciseVolume, emptyVolume } from './volume'

const EPS = 1e-9

/**
 * Ordre chronologique : date, puis `startedAt` (absent = début de journée). Deux séances de même date et même
 * `startedAt` ne sont pas ordonnées (0).
 */
export function compareSessionTime(a: Session, b: Session): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  const sa = a.startedAt ?? ''
  const sb = b.startedAt ?? ''
  return sa === sb ? 0 : sa < sb ? -1 : 1
}

/** Durée réelle en minutes (arrondie), si `startedAt` et `endedAt` sont présents et cohérents. */
export function actualMinutes(session: Session): number | undefined {
  if (session.startedAt === undefined || session.endedAt === undefined) return undefined
  const ms = Date.parse(session.endedAt) - Date.parse(session.startedAt)
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60000) : undefined
}

/** Séries de chaque exercice fusionnées sur tous les blocs, dans l'ordre de première apparition. */
export function mergedSets(session: Session): Map<Id, SetEntry[]> {
  const out = new Map<Id, SetEntry[]>()
  for (const b of session.blocks) {
    for (const se of b.exercises) {
      const list = out.get(se.exerciseId) ?? []
      list.push(...se.sets)
      out.set(se.exerciseId, list)
    }
  }
  return out
}

const isDone = (s: SetEntry): boolean => s.status === 'done'

/**
 * Tonnage d'une série chargée en répétitions = charge × reps ; × 2 pour un exercice unilatéral, car les reps
 * saisies sont par côté (série complète d'un côté puis de l'autre). Exercice inconnu : d'après la série seule,
 * bilatéral. Exportée pour la page Progrès (même convention que le récapitulatif).
 */
export function tonnageOf(set: SetEntry, ex: Exercise | undefined): number {
  if (!isDone(set) || set.loadKg === undefined || set.actualReps === undefined) return 0
  if (ex !== undefined && ex.loadType !== 'kettlebell') return 0
  return set.loadKg * set.actualReps * (ex?.unilateral === true ? 2 : 1)
}

function summarizeExercise(
  exerciseId: Id,
  sets: readonly SetEntry[],
  ex: Exercise | undefined,
): ExerciseSummary {
  const done = sets.filter(isDone)
  const loads = done.map((s) => s.loadKg).filter((x): x is number => x !== undefined)
  const summary: ExerciseSummary = {
    exerciseId,
    setsDone: done.length,
    setsSkipped: sets.filter((s) => s.status === 'skipped').length,
    totalReps: done.reduce((a, s) => a + (s.actualReps ?? 0), 0),
    totalDurationSec: done.reduce((a, s) => a + (s.actualDurationSec ?? 0), 0),
    tonnageKg: sets.reduce((a, s) => a + tonnageOf(s, ex), 0),
  }
  if (loads.length > 0) summary.topLoadKg = Math.max(...loads)
  return summary
}

/** Clé de charge d'une série : `bw` (poids du corps / sans charge) ou la charge en kg. */
function loadKey(set: SetEntry): string {
  return set.loadKg === undefined ? 'bw' : String(set.loadKg)
}

function bestBy(sets: readonly SetEntry[], value: (s: SetEntry) => number | undefined): Map<string, number> {
  const best = new Map<string, number>()
  for (const s of sets) {
    const v = value(s)
    if (v === undefined) continue
    const k = loadKey(s)
    best.set(k, Math.max(best.get(k) ?? Number.NEGATIVE_INFINITY, v))
  }
  return best
}

/**
 * Records d'un exercice par rapport aux séances antérieures (`priorSessions` : séries de chaque séance passée).
 * Aucun record sans passage antérieur (rien à battre), ni pour une mesure jamais faite avant (ex. première séance
 * chargée après l'apprentissage sans charge, ou nouvelle charge pour `reps` / `duration`).
 */
function exerciseRecords(
  exerciseId: Id,
  sets: readonly SetEntry[],
  priorSessions: readonly (readonly SetEntry[])[],
  ex: Exercise | undefined,
): PersonalRecord[] {
  const done = sets.filter(isDone)
  const priorDone = priorSessions.flatMap((p) => p.filter(isDone))
  if (done.length === 0 || priorDone.length === 0) return []
  const records: PersonalRecord[] = []

  const loadsNow = done.map((s) => s.loadKg).filter((x): x is number => x !== undefined)
  const loadsBefore = priorDone.map((s) => s.loadKg).filter((x): x is number => x !== undefined)
  if (loadsNow.length > 0 && loadsBefore.length > 0) {
    const value = Math.max(...loadsNow)
    const previous = Math.max(...loadsBefore)
    if (value > previous + EPS) records.push({ exerciseId, kind: 'load', value, previous })
  }

  for (const [kind, pick] of [
    ['reps', (s: SetEntry) => s.actualReps],
    ['duration', (s: SetEntry) => s.actualDurationSec],
  ] as const) {
    const now = bestBy(done, pick)
    const before = bestBy(priorDone, pick)
    for (const [k, value] of now) {
      const previous = before.get(k)
      if (previous === undefined || value <= previous) continue
      const record: PersonalRecord = { exerciseId, kind, value, previous }
      if (k !== 'bw') record.loadKg = Number(k)
      records.push(record)
    }
  }

  const tonnage = done.reduce((a, s) => a + tonnageOf(s, ex), 0)
  const priorTonnage = Math.max(0, ...priorSessions.map((p) => p.reduce((a, s) => a + tonnageOf(s, ex), 0)))
  if (tonnage > 0 && priorTonnage > 0 && tonnage > priorTonnage + EPS) {
    records.push({ exerciseId, kind: 'tonnage', value: tonnage, previous: priorTonnage })
  }
  return records
}

/**
 * Récapitulatif d'une séance (SPEC §3.4) : séries faites / passées, reps, tonnage, volume par groupe et records.
 * Séries fusionnées par exercice. Records comparés aux séances `done` antérieures de `history` (la séance
 * elle-même est exclue par id ; « antérieure » = date puis `startedAt` strictement avant, voir
 * `compareSessionTime`). Un exercice absent de la bibliothèque compte dans les totaux mais pas dans le volume.
 */
export function summarizeSession(
  session: Session,
  library: readonly Exercise[],
  history: readonly Session[],
): SessionSummary {
  const index = new Map(library.map((e) => [e.id, e]))
  const merged = mergedSets(session)
  const prior = history.filter(
    (h) => h.status === 'done' && h.id !== session.id && compareSessionTime(h, session) < 0,
  )
  const priorMerged = prior.map(mergedSets)

  const exercises: ExerciseSummary[] = []
  const records: PersonalRecord[] = []
  const volume = emptyVolume()
  for (const [exerciseId, sets] of merged) {
    const ex = index.get(exerciseId)
    const summary = summarizeExercise(exerciseId, sets, ex)
    exercises.push(summary)
    if (ex !== undefined && summary.setsDone > 0) addExerciseVolume(volume, ex, summary.setsDone)
    const priorSets = priorMerged
      .map((m) => m.get(exerciseId))
      .filter((s): s is SetEntry[] => s !== undefined)
    records.push(...exerciseRecords(exerciseId, sets, priorSets, ex))
  }

  const result: SessionSummary = {
    setsDone: exercises.reduce((a, e) => a + e.setsDone, 0),
    setsSkipped: exercises.reduce((a, e) => a + e.setsSkipped, 0),
    totalReps: exercises.reduce((a, e) => a + e.totalReps, 0),
    tonnageKg: exercises.reduce((a, e) => a + e.tonnageKg, 0),
    volume,
    exercises,
    records,
  }
  const actual = actualMinutes(session)
  if (actual !== undefined) result.actualMin = actual
  return result
}

/**
 * Lignes de l'historique (SPEC §3.6) : séances `done` et `abandoned`, plus récentes d'abord (date, `startedAt`,
 * puis id pour un ordre stable). `exerciseIds` = exercices ayant au moins une série faite, sans doublon.
 */
export function historyItems(sessions: readonly Session[]): SessionHistoryItem[] {
  return sessions
    .filter((s) => s.status === 'done' || s.status === 'abandoned')
    .sort((a, b) => compareSessionTime(b, a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .map((s) => {
      const merged = mergedSets(s)
      const exerciseIds = [...merged].filter(([, sets]) => sets.some(isDone)).map(([id]) => id)
      const item: SessionHistoryItem = {
        id: s.id,
        date: s.date,
        status: s.status,
        durationMin: s.durationMin,
        setsDone: [...merged.values()].reduce((a, sets) => a + sets.filter(isDone).length, 0),
        exerciseIds,
      }
      const actual = actualMinutes(s)
      if (actual !== undefined) item.actualMin = actual
      if (s.startedAt !== undefined) item.startedAt = s.startedAt
      return item
    })
}
