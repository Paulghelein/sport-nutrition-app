import { describe, expect, it } from 'vitest'
import type { DaySummary } from '../../domain/progress/daySummary'
import type { PersonalRecord, Profile, WeighIn } from '../../types'
import {
  dayView,
  heatmapRange,
  makeTargetsFor,
  recordKindLabel,
  recordRows,
  recordValueText,
  relativeDay,
  toStripDays,
} from './calendarModel'

const rec = (over: Partial<PersonalRecord>): PersonalRecord => ({
  exerciseId: 'goblet-squat',
  kind: 'load',
  value: 18,
  previous: 16,
  ...over,
})

describe('heatmapRange', () => {
  it('12 colonnes : du lundi d’il y a 11 semaines au dimanche de la semaine en cours', () => {
    expect(heatmapRange('2026-10-16')).toEqual({ from: '2026-07-27', to: '2026-10-18' })
    // Un lundi et un dimanche : même semaine.
    expect(heatmapRange('2026-10-12')).toEqual({ from: '2026-07-27', to: '2026-10-18' })
    expect(heatmapRange('2026-10-18')).toEqual({ from: '2026-07-27', to: '2026-10-18' })
  })
  it('passage d’année : 84 jours, lundi à dimanche', () => {
    // 2027-01-01 est un vendredi : semaine du lundi 2026-12-28.
    expect(heatmapRange('2027-01-01')).toEqual({ from: '2026-10-12', to: '2027-01-03' })
  })
})

describe('textes de records', () => {
  it('valeur : charge, reps à charge, poids du corps, durée, tonnage, temps fixe', () => {
    expect(recordValueText(rec({}))).toBe('18 kg')
    expect(recordValueText(rec({ kind: 'reps', value: 12, loadKg: 18 }))).toBe('18 kg × 12')
    expect(recordValueText(rec({ kind: 'reps', value: 14, loadKg: undefined }))).toBe('max 14')
    expect(recordValueText(rec({ kind: 'duration', value: 45, loadKg: 8 }))).toBe('45 s à 8 kg')
    expect(recordValueText(rec({ kind: 'duration', value: 45 }))).toBe('45 s')
    expect(recordValueText(rec({ kind: 'tonnage', value: 1234.4 }))).toContain('1')
    expect(recordValueText(rec({ kind: 'reps', value: 36, windowSec: 45, loadKg: 12 }))).toBe(
      '36 reps en 45 s à 12 kg',
    )
    expect(recordValueText(rec({ kind: 'reps', value: 36, windowSec: 45 }))).toBe('36 reps en 45 s')
  })
  it('nature', () => {
    expect(recordKindLabel(rec({}))).toBe('Charge max')
    expect(recordKindLabel(rec({ kind: 'reps' }))).toBe('Répétitions')
    expect(recordKindLabel(rec({ kind: 'reps', windowSec: 60 }))).toBe('Reps en temps fixe')
  })
})

describe('relativeDay', () => {
  it('aujourd’hui, hier, jour de la semaine (≤ 6 jours), sinon date', () => {
    const today = '2026-10-16'
    expect(relativeDay('2026-10-16', today)).toBe('aujourd’hui')
    expect(relativeDay('2026-10-15', today)).toBe('hier')
    expect(relativeDay('2026-10-14', today)).toBe('mercredi')
    expect(relativeDay('2026-10-10', today)).toBe('samedi')
    expect(relativeDay('2026-10-09', today)).toBe('le 9 octobre')
    expect(relativeDay('2026-10-01', today)).toBe('le 1er octobre')
  })
})

describe('recordRows', () => {
  it('une ligne par record, nom, détail, valeur', () => {
    const rows = recordRows(
      [{ record: rec({}), date: '2026-10-14', sessionId: 's1' }],
      () => 'Goblet squat',
      '2026-10-16',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Goblet squat', detail: 'Charge max · mercredi', value: '18 kg' })
  })
})

describe('toStripDays', () => {
  it('marque aujourd’hui', () => {
    const out = toStripDays(
      [
        {
          date: '2026-10-15',
          level: 2,
          sessions: 1,
          minutes: 30,
          record: false,
          nutritionOk: true,
          future: false,
        },
        {
          date: '2026-10-16',
          level: 0,
          sessions: 0,
          minutes: 0,
          record: false,
          nutritionOk: null,
          future: false,
        },
      ],
      '2026-10-16',
    )
    expect(out.map((d) => d.today)).toEqual([false, true])
    expect(out[0]).toMatchObject({ level: 2, sessions: 1, minutes: 30, nutritionOk: true })
  })
  it('la journée en cours n’est jamais jugée (nutritionOk null)', () => {
    const out = toStripDays(
      [
        {
          date: '2026-10-16',
          level: 1,
          sessions: 1,
          minutes: 20,
          record: false,
          nutritionOk: false,
          future: false,
        },
      ],
      '2026-10-16',
    )
    expect(out[0]?.nutritionOk).toBeNull()
  })
})

describe('makeTargetsFor', () => {
  const profile = {
    id: 'me',
    sex: 'male',
    birthDate: '1998-05-12',
    heightCm: 178,
    activityLevel: 'moderate',
    goal: 'bulk',
    level: 1,
    weeklySessionsTarget: 3,
    weeklySessionsMin: 2,
    nutrition: { surplus: 0.12, proteinPerKg: 1.8, fatShare: 0.27, kcalAdjustment: 0 },
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
  } as unknown as Profile
  it('null sans pesée, sinon kcal et protéines du jour', () => {
    expect(makeTargetsFor(profile, [])('2026-10-16')).toBeNull()
    const w = { id: 'w', date: '2026-10-15', weightKg: 75, createdAt: '' } as WeighIn
    const t = makeTargetsFor(profile, [w])('2026-10-16')
    expect(t?.kcal).toBeGreaterThan(2500)
    expect(t?.protein).toBeGreaterThan(100)
  })
})

describe('dayView', () => {
  const summary: DaySummary = {
    date: '2026-10-14',
    future: false,
    level: 4,
    nutritionOk: true,
    sessions: [
      {
        id: 's',
        minutes: 31.6,
        setsDone: 1,
        exerciseIds: ['a', 'b', 'c', 'd', 'e'],
        records: [rec({ kind: 'reps', value: 12, loadKg: 18 })],
      },
    ],
    meals: [{ slot: 'lunch', kcal: 820, protein: 50, names: ['Riz', 'Poulet'] }],
    totals: { kcal: 820, protein: 50 },
    targets: { kcal: 2800, protein: 140 },
  }
  const nameOf = (id: string) => `Ex ${id}`

  it('titre en français, séance arrondie, 3 exercices + reste, record, repas', () => {
    const v = dayView(summary, nameOf, '2026-10-16')
    expect(v.title).toBe('Mercredi 14 octobre')
    expect(v.description).toBeUndefined()
    expect(v.sessions[0]).toMatchObject({
      title: 'Séance de 32 min',
      details: '1 série · Ex a, Ex b, Ex c… (+2)',
      records: ['Ex goblet-squat, 18 kg × 12'],
    })
    expect(v.meals).toEqual([{ id: 'lunch', label: 'Déjeuner', details: 'Riz, Poulet', kcal: 820 }])
    expect(v.targets).toEqual({ kcal: 2800, protein: 140 })
  })

  it('journée en cours : inProgress seulement pour aujourd’hui', () => {
    expect(dayView({ ...summary, date: '2026-10-16' }, nameOf, '2026-10-16').inProgress).toBe(true)
    expect(dayView(summary, nameOf, '2026-10-16').inProgress).toBe(false)
  })

  it('aujourd’hui et à venir', () => {
    expect(dayView({ ...summary, date: '2026-10-16' }, nameOf, '2026-10-16').description).toBe('Aujourd’hui')
    const future = dayView({ ...summary, date: '2026-10-17', future: true }, nameOf, '2026-10-16')
    expect(future.description).toBe('À venir')
    expect(future.future).toBe(true)
  })
})
