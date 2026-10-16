// Records récents (v2) : les derniers records battus, datés, pour la carte de l'écran Progrès. Fonctions pures.
import type { LocalDate } from '../../types/common'
import type { PersonalRecord } from '../../types/guided'
import type { Session } from '../../types/training'
import { compareSessionTime, summarizeSession } from '../training/summary'
import type { ExercisesById } from './strength'

export interface DatedRecord {
  record: PersonalRecord
  /** Date de la séance qui l'a battu. */
  date: LocalDate
  sessionId: string
}

/** Clé d'un record : exercice, type, charge et fenêtre (un record en temps fixe ne se confond pas avec une série libre). */
const keyOf = (r: PersonalRecord): string =>
  `${r.exerciseId}|${r.kind}|${r.loadKg ?? 'bw'}|${r.windowSec ?? '-'}`

/**
 * Records battus par les séances `done` de `from` à `to` inclus (règle du récapitulatif : `summarizeSession`, le
 * premier passage sur un exercice n'est pas un record), du plus récent au plus ancien, `limit` au plus. Un même
 * record battu plusieurs fois ne compte qu'une fois : le plus récent (donc la meilleure valeur).
 */
export function recentRecords(
  sessions: readonly Session[],
  from: LocalDate,
  to: LocalDate,
  exercisesById: ExercisesById,
  limit = 5,
): DatedRecord[] {
  const library = [...exercisesById.values()]
  const inRange = sessions
    .filter((s) => s.status === 'done' && s.date >= from && s.date <= to)
    .sort((a, b) => compareSessionTime(b, a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  const seen = new Set<string>()
  const out: DatedRecord[] = []
  for (const s of inRange) {
    for (const record of summarizeSession(s, library, sessions).records) {
      const key = keyOf(record)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ record, date: s.date, sessionId: s.id })
    }
    if (out.length >= limit) break
  }
  return out.slice(0, limit)
}
