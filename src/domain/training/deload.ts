// Semaine allégée (deload, SPEC §3.3) : volume × 0,5, charge inchangée.
import type { LocalDate } from '../../types/common'
import type { DeloadReason, DeloadStatus } from '../../types/engine'
import type { EngineSettings } from '../../types/settings'
import type { Session, SetEntry } from '../../types/training'
import { addDays, daysBetween } from '../shared/dates'
import { dominantFeeling } from './feeling'

/** Durée d'un deload en jours. */
export const DELOAD_DAYS = 7
/** Fréquence par défaut du deload programmé (SPEC §3.5). */
export const DEFAULT_DELOAD_EVERY_WEEKS = 6
/** Nombre de séances `hard` majoritaires sur 7 jours qui déclenchent un deload. */
export const FATIGUE_HARD_SESSIONS = 3

/** Fréquence effective ; une valeur invalide (< 1, non finie) revient au défaut (6 semaines). */
export function deloadEveryWeeks(settings: EngineSettings): number {
  const w = settings.deloadEveryWeeks
  return Number.isFinite(w) && w >= 1 ? Math.floor(w) : DEFAULT_DELOAD_EVERY_WEEKS
}

function sessionDoneSets(s: Session): SetEntry[] {
  return s.blocks.flatMap((b) => b.exercises.flatMap((e) => e.sets.filter((x) => x.status === 'done')))
}

/** Séance majoritairement `hard` : au moins la moitié de ses séries faites sont `hard` (même règle qu'un exercice). */
export function isHardSession(s: Session): boolean {
  const sets = sessionDoneSets(s)
  return sets.length > 0 && dominantFeeling(sets) === 'hard'
}

/** Premier jour de chaque bloc de deload : séances deload regroupées par fenêtres de 7 jours. */
function deloadBlockStarts(done: readonly Session[]): LocalDate[] {
  const dates = [...new Set(done.filter((s) => s.deload).map((s) => s.date))].sort()
  const starts: LocalDate[] = []
  for (const d of dates) {
    const last = starts[starts.length - 1]
    if (last === undefined || daysBetween(last, d) >= DELOAD_DAYS) starts.push(d)
  }
  return starts
}

/** Déclencheur d'un nouveau deload au jour `day`, d'après les séances `done` datées jusqu'à `day`. */
function trigger(done: readonly Session[], day: LocalDate, everyWeeks: number): DeloadReason | null {
  const past = done.filter((s) => daysBetween(s.date, day) >= 0)
  if (past.length === 0) return null
  const lastStart = deloadBlockStarts(past).at(-1)

  // Fatigue : ≥ 3 séances hard sur [day − 6, day], hors séances de deload. Un deload dure 7 jours : quand il
  // se termine, la fenêtre ne contient plus aucune séance antérieure à son début (pas de deload enchaîné).
  const windowStart = addDays(day, -(DELOAD_DAYS - 1))
  const hard = past.filter((s) => !s.deload && s.date >= windowStart && isHardSession(s)).length
  if (hard >= FATIGUE_HARD_SESSIONS) return 'fatigue'

  // Programmé : ≥ N semaines depuis le début du cycle (dernier deload, sinon première séance faite).
  const cycleStart = lastStart ?? [...past].map((s) => s.date).sort()[0]
  if (cycleStart !== undefined && daysBetween(cycleStart, day) >= everyWeeks * 7) return 'scheduled'
  return null
}

/**
 * État du deload au jour `today` :
 * (a) un deload a commencé il y a moins de 7 jours (séance `done` avec `deload: true`) → actif depuis sa première séance ;
 * (b) programmé : ≥ `deloadEveryWeeks` semaines depuis le dernier deload (sinon depuis la première séance faite) ;
 * (c) fatigue : ≥ 3 séances `done` majoritairement `hard` sur les 7 derniers jours (après le dernier deload).
 * Pour (b) et (c), `since = today` (le deload commence avec la prochaine séance).
 */
export function deloadStatus(
  sessions: readonly Session[],
  today: LocalDate,
  settings: EngineSettings,
): DeloadStatus {
  const everyWeeks = deloadEveryWeeks(settings)
  const done = sessions.filter((s) => s.status === 'done' && daysBetween(s.date, today) >= 0)

  const lastStart = deloadBlockStarts(done).at(-1)
  if (lastStart !== undefined && daysBetween(lastStart, today) < DELOAD_DAYS) {
    // Raison d'origine : ce qui le déclenchait le jour de son début, d'après les séances antérieures
    // (inconnue s'il a été lancé autrement).
    const reason = trigger(
      done.filter((s) => s.date < lastStart),
      lastStart,
      everyWeeks,
    )
    return reason === null ? { active: true, since: lastStart } : { active: true, reason, since: lastStart }
  }

  const reason = trigger(done, today, everyWeeks)
  return reason === null ? { active: false } : { active: true, reason, since: today }
}

/**
 * Séries d'un exercice pendant un deload : moitié, arrondie au supérieur, au moins 2
 * (3 → 2, 4 → 2, 5 → 3). On garde au moins 2 séries pour entretenir le geste ; la charge ne change pas.
 * Un exercice prévu à 1 série reste à 1.
 */
export function deloadSets(sets: number): number {
  if (sets <= 2) return sets
  return Math.max(2, Math.ceil(sets / 2))
}
