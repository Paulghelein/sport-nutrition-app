import { describe, expect, it } from 'vitest'
import {
  buildJournalMessage,
  buildProgressMessage,
  buildReviewMessage,
  buildSessionAfterMessage,
  buildSessionBeforeMessage,
} from '../../domain/claude/context'
import type { Profile, WeighIn, WeeklyReview } from '../../types'
import type { SessionSummary } from '../../types/guided'
import { doneSession, makeEquipment, seedLibrary } from '../../domain/training/testkit'
import type { ProgressModel } from '../progress/progressModel'
import { claudeBase, progressData, reviewData, sessionAfterData, sessionBeforeData } from './inputs'

const T = '2026-10-16T08:00:00.000Z'
const profile: Profile = {
  id: 'me',
  name: 'Paul',
  sex: 'male',
  birthDate: '2001-03-04',
  heightCm: 178,
  activityLevel: 'moderate',
  goal: 'bulk',
  level: 1,
  weeklySessionsTarget: 5,
  weeklySessionsMin: 3,
  nutrition: { surplus: 0.12, proteinPerKg: 1.8, fatShare: 0.27, kcalAdjustment: 0 },
  createdAt: T,
  updatedAt: T,
}
const weigh = (date: string, weightKg: number): WeighIn =>
  ({ id: date, date, weightKg, createdAt: T }) as WeighIn
const equipment = makeEquipment(['mat'])

describe('claudeBase', () => {
  it('objectifs calculés sur le poids du jour', () => {
    const base = claudeBase({
      profile,
      equipment,
      weighIns: [weigh('2026-10-15', 72), weigh('2026-10-16', 73)],
      today: '2026-10-16',
    })
    expect(base?.targets.weightKg).toBeCloseTo(72.5)
    expect(base?.targets.kcal).toBeGreaterThan(2000)
    expect(base?.today).toBe('2026-10-16')
  })
  it('undefined sans profil, sans matériel ou sans pesée', () => {
    const w = [weigh('2026-10-16', 73)]
    expect(claudeBase({ profile: undefined, equipment, weighIns: w, today: '2026-10-16' })).toBeUndefined()
    expect(claudeBase({ profile, equipment: undefined, weighIns: w, today: '2026-10-16' })).toBeUndefined()
    expect(claudeBase({ profile, equipment, weighIns: [], today: '2026-10-16' })).toBeUndefined()
  })
  it('pesée future ignorée', () => {
    expect(
      claudeBase({ profile, equipment, weighIns: [weigh('2026-10-20', 73)], today: '2026-10-16' }),
    ).toBeUndefined()
  })
})

const base = claudeBase({ profile, equipment, weighIns: [weigh('2026-10-16', 73)], today: '2026-10-16' })
if (!base) throw new Error('base')
const library = seedLibrary()

describe('entrées des messages', () => {
  it('séance avant : blocs affichés et durée estimée', () => {
    const session = doneSession('2026-10-16', [['goblet-squat', 3]])
    const extra = sessionBeforeData({ durationMin: 30, deload: false }, session.blocks, 27, library)
    const msg = buildSessionBeforeMessage({ ...base, ...extra, request: 'Trop dur ?' })
    expect(msg.kind).toBe('session_before')
    expect(msg.text).toContain('"dureeEstimeeMin":27')
    expect(msg.text).toContain('Ma demande : Trop dur ?')
    expect(msg.text).toContain('Exercices disponibles')
  })
  it('séance après : durée réelle et records', () => {
    const session = doneSession('2026-10-16', [['goblet-squat', 3]])
    const summary = {
      actualMin: 41,
      records: [{ exerciseId: 'goblet-squat', kind: 'reps', value: 12, previous: 10 }],
    } as unknown as SessionSummary
    const data = sessionAfterData(session, summary, library)
    expect(data.actualMin).toBe(41)
    const msg = buildSessionAfterMessage({ ...base, ...data })
    expect(msg.text).toContain('"dureeReelleMin":41')
    expect(msg.text).toContain('"type":"répétitions"')
    expect('actualMin' in sessionAfterData(session, { ...summary, actualMin: undefined }, library)).toBe(
      false,
    )
  })
  it('journal : objectifs de l’écran prioritaires', () => {
    const day = { date: '2026-10-14', meals: [], totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 } }
    const msg = buildJournalMessage({ ...base, targets: { ...base.targets, kcal: 3000 }, day })
    expect(msg.text).toContain('3000 kcal')
  })
  it('bilan : noms des exercices des records', () => {
    const review = {
      weekStart: '2026-10-05',
      sessions: 3,
      plannedSessions: 4,
      minutes: 120,
      records: [
        { exerciseId: 'goblet-squat', kind: 'load', value: 20, previous: 16 },
        { exerciseId: 'goblet-squat', kind: 'reps', value: 12, previous: 10 },
      ],
      weightChangeKg: 0.3,
      nutrition: {
        from: '2026-10-05',
        to: '2026-10-11',
        daysLogged: 5,
        avgKcal: 2900,
        avgProtein: 130,
        targetKcal: 3000,
        targetProtein: 135,
        daysInTarget: 4,
      },
      suggestion: { message: 'Bien' },
    } as unknown as WeeklyReview
    const data = reviewData(review, (id) => (id === 'goblet-squat' ? 'Goblet squat' : 'x'))
    expect(data.exercises).toEqual([{ id: 'goblet-squat', name: 'Goblet squat' }])
    expect(buildReviewMessage({ ...base, ...data }).text).toContain('Goblet squat')
  })
  it('progrès : tendance de poids sur 28 jours', () => {
    const model = {
      today: '2026-10-16',
      weight: {
        summary: { latest: null, avg7d: 73, change7dKg: 0.2, change28dKg: 0.8 },
        recent: [weigh('2026-10-16', 73), weigh('2026-09-19', 72), weigh('2026-09-18', 72)],
      },
      regularity: { weeks: [], currentStreak: 2, bestStreak: 3 },
      volumes: [],
      nutrition: {
        from: '2026-10-12',
        to: '2026-10-15',
        daysLogged: 3,
        avgKcal: 2900,
        avgProtein: 130,
        targetKcal: 3000,
        targetProtein: 135,
        daysInTarget: 2,
      },
      strength: [
        {
          exerciseId: 'goblet-squat',
          name: 'Goblet squat',
          strength: { exerciseId: 'goblet-squat', points: [], records: {} },
          metric: 'load',
        },
      ],
    } as unknown as ProgressModel
    const data = progressData(model)
    expect(data.weight).toEqual({ avg7Kg: 73, avg7Kg28DaysAgo: 72.2, weighIns28d: 2 })
    expect(data.exercises).toEqual([{ id: 'goblet-squat', name: 'Goblet squat' }])
    expect(buildProgressMessage({ ...base, ...data }).text).toContain('"variation28jKg":0.8')
  })
  it('progrès : tendance absente sans moyenne', () => {
    const model = {
      today: '2026-10-16',
      weight: { summary: { latest: null, avg7d: null, change7dKg: null, change28dKg: null }, recent: [] },
      regularity: { weeks: [], currentStreak: 0, bestStreak: 0 },
      volumes: [],
      nutrition: {
        from: '2026-10-12',
        to: '2026-10-15',
        daysLogged: 0,
        avgKcal: null,
        avgProtein: null,
        targetKcal: 0,
        targetProtein: 0,
        daysInTarget: 0,
      },
      strength: [],
    } as unknown as ProgressModel
    expect(progressData(model).weight).toEqual({ avg7Kg: null, avg7Kg28DaysAgo: null, weighIns28d: 0 })
  })
})
