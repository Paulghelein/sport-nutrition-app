// Régularité (SPEC §8) : séances et minutes par semaine, séries de semaines ≥ seuil (3 par défaut).
// Fonctions pures.
import type { LocalDate } from '../../types/common'
import type { Regularity, WeekActivity, WeekStart } from '../../types/progress'
import { REGULARITY_WEEK_TARGET } from '../../types/progress'
import type { Session } from '../../types/training'
import { addDays, daysBetween } from '../shared/dates'
import { actualMinutes } from '../training/summary'

/** Un lundi de référence (5 janvier 1970). */
const REFERENCE_MONDAY: LocalDate = '1970-01-05'

/** Lundi de la semaine (lundi → dimanche) d'une date locale `YYYY-MM-DD`. */
export function weekStartOf(date: LocalDate): WeekStart {
  const offset = ((daysBetween(REFERENCE_MONDAY, date) % 7) + 7) % 7
  return addDays(date, -offset)
}

/** Plafond des minutes réelles d'une séance, en multiple de la durée prévue. */
export const SESSION_MINUTES_CAP_FACTOR = 2

/**
 * Minutes comptées pour une séance : durée réelle si connue, sinon durée prévue. La durée réelle est plafonnée à
 * `SESSION_MINUTES_CAP_FACTOR` × durée prévue : une séance oubliée ouverte (terminée des heures plus tard) ne
 * gonfle pas les minutes de la semaine.
 */
export function sessionMinutes(session: Session): number {
  const actual = actualMinutes(session)
  if (actual === undefined) return session.durationMin
  return Math.min(actual, SESSION_MINUTES_CAP_FACTOR * session.durationMin)
}

/** Séances `done` datées au plus tard `today` (une séance future est ignorée). */
function doneUpTo(sessions: readonly Session[], today: LocalDate): Session[] {
  return sessions.filter((s) => s.status === 'done' && s.date <= today)
}

function activityByWeek(sessions: readonly Session[]): Map<WeekStart, WeekActivity> {
  const out = new Map<WeekStart, WeekActivity>()
  for (const s of sessions) {
    const weekStart = weekStartOf(s.date)
    const w = out.get(weekStart) ?? { weekStart, sessions: 0, minutes: 0 }
    w.sessions += 1
    w.minutes += sessionMinutes(s)
    out.set(weekStart, w)
  }
  return out
}

export interface RegularityOptions {
  /** Semaines affichées (défaut 12, au moins 1). */
  weeks?: number
  /**
   * Séances pour qu'une semaine compte dans la série (défaut `REGULARITY_WEEK_TARGET`). L'appelant passe
   * `min(REGULARITY_WEEK_TARGET, profile.weeklySessionsMin)` : un profil à 2 séances/sem. peut avoir une
   * série. Entier ≥ 1 (arrondi au supérieur ; non fini → défaut, < 1 → 1 : une semaine vide ne compte
   * jamais).
   */
  weekTarget?: number
}

/** Seuil de série effectivement utilisé pour une option `weekTarget` (voir `RegularityOptions`). */
export function regularityWeekTarget(weekTarget?: number): number {
  if (weekTarget === undefined || !Number.isFinite(weekTarget)) return REGULARITY_WEEK_TARGET
  return Math.max(1, Math.ceil(weekTarget))
}

/**
 * Régularité sur `weeks` semaines (défaut 12, au moins 1), la semaine de `today` en dernier, même vide.
 * Seules les séances `done` datées au plus tard `today` comptent ; minutes = `sessionMinutes` (durée réelle
 * plafonnée, sinon durée prévue). Séries (voir `Regularity`) : semaines ≥ `weekTarget` séances (défaut
 * `REGULARITY_WEEK_TARGET`), calculées sur tout l'historique, pas seulement sur la fenêtre affichée.
 * Troisième argument : nombre de semaines (forme historique) ou options `{ weeks, weekTarget }`.
 */
export function regularity(
  sessions: readonly Session[],
  today: LocalDate,
  options: number | RegularityOptions = {},
): Regularity {
  const opts: RegularityOptions = typeof options === 'number' ? { weeks: options } : options
  const weeks = opts.weeks ?? 12
  const n = Math.max(1, Math.floor(Number.isFinite(weeks) ? weeks : 12))
  const target = regularityWeekTarget(opts.weekTarget)
  const byWeek = activityByWeek(doneUpTo(sessions, today))
  const current = weekStartOf(today)
  const good = (w: WeekStart): boolean => (byWeek.get(w)?.sessions ?? 0) >= target

  const list: WeekActivity[] = []
  for (let i = n - 1; i >= 0; i--) {
    const weekStart = addDays(current, -7 * i)
    const w = byWeek.get(weekStart)
    list.push({ weekStart, sessions: w?.sessions ?? 0, minutes: w?.minutes ?? 0 })
  }

  // Série en cours : depuis la semaine dernière en remontant ; la semaine en cours s'ajoute si elle est bonne.
  let currentStreak = 0
  for (let w = addDays(current, -7); good(w); w = addDays(w, -7)) currentStreak += 1
  if (good(current)) currentStreak += 1

  // Meilleure série : semaines consécutives de la plus ancienne semaine active jusqu'à la semaine en cours.
  let bestStreak = 0
  const starts = [...byWeek.keys()].sort()
  const first = starts[0]
  if (first !== undefined) {
    let run = 0
    for (let w = first; w <= current; w = addDays(w, 7)) {
      run = good(w) ? run + 1 : 0
      bestStreak = Math.max(bestStreak, run)
    }
  }

  return {
    weeks: list,
    currentStreak,
    bestStreak: Math.max(bestStreak, currentStreak),
    totalMinutes: list.reduce((a, w) => a + w.minutes, 0),
  }
}
