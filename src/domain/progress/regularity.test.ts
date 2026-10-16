import { describe, expect, it } from 'vitest'
import type { Session } from '../../types/training'
import { addDays } from '../shared/dates'
import { regularity, sessionMinutes, weekStartOf } from './regularity'

const T0 = '2026-10-15T08:00:00.000Z'
let seq = 0

function sess(date: string, over: Partial<Session> = {}): Session {
  seq += 1
  return {
    id: `s${seq}`,
    date,
    durationMin: 30,
    status: 'done',
    warmup: [],
    blocks: [],
    deload: false,
    estimatedMin: 30,
    updatedAt: T0,
    ...over,
  }
}

/** `n` séances dans la semaine du lundi `monday` (lundi, mercredi, vendredi, …). */
const week = (monday: string, n: number, over: Partial<Session> = {}): Session[] =>
  Array.from({ length: n }, (_, i) => sess(addDays(monday, (i * 2) % 7), over))

describe('weekStartOf', () => {
  it('renvoie le lundi pour chaque jour de la semaine', () => {
    for (let i = 0; i < 7; i++) expect(weekStartOf(addDays('2026-10-12', i))).toBe('2026-10-12')
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19')
  })
  it('traverse les changements de mois et d’année', () => {
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28') // vendredi
    expect(weekStartOf('2026-03-01')).toBe('2026-02-23') // dimanche
    expect(weekStartOf('2024-02-29')).toBe('2024-02-26')
    expect(weekStartOf('1970-01-01')).toBe('1969-12-29') // avant le lundi de référence
  })
})

describe('sessionMinutes', () => {
  it('durée réelle si connue, sinon durée prévue', () => {
    expect(sessionMinutes(sess('2026-10-15'))).toBe(30)
    expect(
      sessionMinutes(
        sess('2026-10-15', { startedAt: '2026-10-15T18:00:00.000Z', endedAt: '2026-10-15T18:42:20.000Z' }),
      ),
    ).toBe(42)
    expect(
      sessionMinutes(
        sess('2026-10-15', { startedAt: '2026-10-15T18:00:00.000Z', endedAt: '2026-10-15T17:00:00.000Z' }),
      ),
    ).toBe(30)
  })

  it('plafond : 2 × durée prévue (séance oubliée ouverte)', () => {
    const start = '2026-10-15T18:00:00.000Z'
    const at = (endedAt: string, durationMin: Session['durationMin'] = 30) =>
      sessionMinutes(sess('2026-10-15', { durationMin, startedAt: start, endedAt }))
    expect(at('2026-10-15T19:00:00.000Z')).toBe(60) // pile 2 × 30
    expect(at('2026-10-15T19:01:00.000Z')).toBe(60)
    expect(at('2026-10-16T02:00:00.000Z', 45)).toBe(90)
  })
})

describe('regularity', () => {
  const today = '2026-10-16' // vendredi, semaine du 12 octobre

  it('historique vide : 12 semaines vides, la semaine en cours en dernier', () => {
    const r = regularity([], today)
    expect(r.weeks).toHaveLength(12)
    expect(r.weeks[11]).toEqual({ weekStart: '2026-10-12', sessions: 0, minutes: 0 })
    expect(r.weeks[0]?.weekStart).toBe('2026-07-27')
    expect(r).toMatchObject({ currentStreak: 0, bestStreak: 0, totalMinutes: 0 })
  })

  it('12 semaines simulées avec trous, abandons et séances futures ignorés', () => {
    const current = '2026-10-12'
    const w = (k: number): string => addDays(current, -7 * k) // k semaines avant
    const sessions = [
      ...week(w(13), 3), // hors fenêtre : compte pour les séries, pas pour les minutes
      ...week(w(11), 3),
      ...week(w(10), 4),
      ...week(w(9), 3),
      // w(8) : trou
      ...week(w(7), 2),
      ...week(w(6), 3),
      ...week(w(5), 3),
      ...week(w(4), 3),
      ...week(w(3), 1),
      ...week(w(2), 3),
      ...week(w(1), 3),
      sess(current), // semaine en cours partielle : 1 séance
      sess(w(1), { status: 'abandoned' }),
      sess(w(2), { status: 'in_progress' }),
      sess('2026-10-17'), // demain : ignorée
    ]
    const r = regularity(sessions, today)
    expect(r.weeks.map((x) => x.sessions)).toEqual([3, 4, 3, 0, 2, 3, 3, 3, 1, 3, 3, 1])
    expect(r.weeks[3]?.weekStart).toBe(w(8))
    expect(r.currentStreak).toBe(2) // w(2), w(1) ; la semaine en cours (1) ne casse pas la série
    expect(r.bestStreak).toBe(3) // w(11)..w(9) ou w(6)..w(4) ; w(13) isolée (w(12) vide)
    expect(r.totalMinutes).toBe(29 * 30)
  })

  it('la semaine en cours s’ajoute à la série dès qu’elle atteint le seuil', () => {
    const sessions = [...week('2026-09-28', 3), ...week('2026-10-05', 3), ...week('2026-10-12', 3)]
    const r = regularity(sessions, '2026-10-17')
    expect(r.currentStreak).toBe(3)
    expect(r.bestStreak).toBe(3)
  })

  it('une semaine dernière sous le seuil remet la série à zéro (sauf la semaine en cours)', () => {
    const sessions = [...week('2026-09-28', 3), ...week('2026-10-05', 2), ...week('2026-10-12', 3)]
    const r = regularity(sessions, today)
    expect(r.currentStreak).toBe(1)
    expect(r.bestStreak).toBe(1)
  })

  it('meilleure série ancienne hors fenêtre conservée', () => {
    const start = '2025-06-02'
    const old = Array.from({ length: 6 }, (_, k) => week(addDays(start, 7 * k), 3)).flat()
    const r = regularity(old, today)
    expect(r.bestStreak).toBe(6)
    expect(r.currentStreak).toBe(0)
    expect(r.totalMinutes).toBe(0)
  })

  it('changement d’année : semaines à cheval sur le 1er janvier', () => {
    // semaine du 29 décembre 2025 (lundi) au 4 janvier 2026
    const sessions = [
      sess('2025-12-22'),
      sess('2025-12-24'),
      sess('2025-12-26'),
      sess('2025-12-30'),
      sess('2026-01-01'),
      sess('2026-01-03'),
      sess('2026-01-05'),
    ]
    const r = regularity(sessions, '2026-01-07', 3)
    expect(r.weeks.map((x) => [x.weekStart, x.sessions])).toEqual([
      ['2025-12-22', 3],
      ['2025-12-29', 3],
      ['2026-01-05', 1],
    ])
    expect(r.currentStreak).toBe(2)
  })

  it('minutes : durée réelle sinon prévue ; paramètre weeks borné à 1', () => {
    const sessions = [
      sess('2026-10-13', { durationMin: 45 }),
      sess('2026-10-14', { startedAt: '2026-10-14T18:00:00.000Z', endedAt: '2026-10-14T18:25:00.000Z' }),
    ]
    const r = regularity(sessions, today, 0)
    expect(r.weeks).toEqual([{ weekStart: '2026-10-12', sessions: 2, minutes: 70 }])
    expect(r.totalMinutes).toBe(70)
  })
})

describe('regularity : cas limites calendaires et durées', () => {
  it('exactement 3 séances = bonne semaine, 2 non', () => {
    expect(regularity(week('2026-10-05', 3), '2026-10-11').currentStreak).toBe(1)
    expect(regularity(week('2026-10-05', 2), '2026-10-11').currentStreak).toBe(0)
  })

  it('semaine du changement d’heure (25 octobre 2026) : 7 jours, séances du dimanche comprises', () => {
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19')
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26')
    const sessions = [sess('2026-10-19'), sess('2026-10-24'), sess('2026-10-25'), sess('2026-10-26')]
    const r = regularity(sessions, '2026-10-28', 2)
    expect(r.weeks.map((w) => [w.weekStart, w.sessions])).toEqual([
      ['2026-10-19', 3],
      ['2026-10-26', 1],
    ])
    expect(r.currentStreak).toBe(1)
    // mars aussi (29 mars 2026)
    expect(weekStartOf('2026-03-29')).toBe('2026-03-23')
  })

  it('53e semaine ISO (2020-W53) : série continue de bout en bout', () => {
    // 2020-12-28 (lundi) est en W53 ; 2021-01-04 est en W01
    const sessions = [...week('2020-12-21', 3), ...week('2020-12-28', 3), ...week('2021-01-04', 3)]
    const r = regularity(sessions, '2021-01-10', 3)
    expect(r.weeks.map((w) => w.weekStart)).toEqual(['2020-12-21', '2020-12-28', '2021-01-04'])
    expect(r.currentStreak).toBe(3)
    expect(r.bestStreak).toBe(3)
  })

  it('séances sans startedAt / avec un seul des deux : durée prévue', () => {
    expect(sessionMinutes(sess('2026-10-15', { startedAt: '2026-10-15T18:00:00.000Z' }))).toBe(30)
    expect(sessionMinutes(sess('2026-10-15', { endedAt: '2026-10-15T18:00:00.000Z' }))).toBe(30)
  })

  it('minutes plafonnées dans l’agrégat hebdomadaire', () => {
    const s = sess('2026-10-13', {
      durationMin: 20,
      startedAt: '2026-10-13T08:00:00.000Z',
      endedAt: '2026-10-13T20:00:00.000Z',
    })
    expect(regularity([s], '2026-10-16').totalMinutes).toBe(40)
  })
})
