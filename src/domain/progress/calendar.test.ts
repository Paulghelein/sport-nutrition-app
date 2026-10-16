import { describe, expect, it } from 'vitest'
import type { FoodLogEntry } from '../../types/nutrition'
import type { Session, SessionBlock, SetEntry } from '../../types/training'
import { T0, seedLibrary } from '../training/testkit'
import { dayActivities, levelFromMinutes, weekDays, type DayActivitiesInput } from './calendar'

const byId = new Map(seedLibrary().map((e) => [e.id, e]))
let seq = 0

/** Séance `done` de `min` minutes réelles (durée prévue 60 : plafond 120). */
function sess(date: string, min: number, over: Partial<Session> = {}): Session {
  seq += 1
  const start = new Date('2026-10-12T10:00:00.000Z')
  return {
    id: `s${seq}`,
    date,
    durationMin: 60,
    status: 'done',
    warmup: [],
    blocks: [],
    deload: false,
    estimatedMin: 60,
    updatedAt: T0,
    startedAt: start.toISOString(),
    endedAt: new Date(start.getTime() + min * 60_000).toISOString(),
    ...over,
  }
}

const reps = (actualReps: number, loadKg: number): SetEntry => ({
  status: 'done',
  actualReps,
  feeling: 'ok',
  loadKg,
})
const blocks = (loadKg: number): SessionBlock[] => [
  {
    id: 'b',
    kind: 'single',
    exercises: [{ exerciseId: 'box-goblet-squat', restSec: 60, sets: [reps(10, loadKg)] }],
  },
]

let eid = 0
const food = (date: string, kcal: number, protein: number): FoodLogEntry => ({
  id: `f${++eid}`,
  date,
  slot: 'lunch',
  name: 'x',
  origin: { kind: 'free' },
  macros: { kcal, protein, carbs: 0, fat: 0 },
  createdAt: T0,
})

const base = (over: Partial<DayActivitiesInput> = {}): DayActivitiesInput => ({
  from: '2026-10-12',
  to: '2026-10-18',
  today: '2026-10-18',
  sessions: [],
  exercisesById: byId,
  foodLog: [],
  targetsFor: () => ({ kcal: 2500, protein: 150 }),
  ...over,
})
const day = (out: ReturnType<typeof dayActivities>, d: string) => {
  const x = out.find((a) => a.date === d)
  if (x === undefined) throw new Error(d)
  return x
}

describe('weekDays', () => {
  it('lundi → dimanche, quel que soit le jour', () => {
    expect(weekDays('2026-10-15')).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ])
    expect(weekDays('2026-10-12')[0]).toBe('2026-10-12')
    expect(weekDays('2026-10-18')[0]).toBe('2026-10-12')
    expect(weekDays('2026-12-31')).toHaveLength(7)
  })
})

describe('niveaux de durée', () => {
  it('seuils 24 / 25 / 45 / 46 min', () => {
    expect(levelFromMinutes(24, 1)).toBe(1)
    expect(levelFromMinutes(25, 1)).toBe(2)
    expect(levelFromMinutes(45, 1)).toBe(2)
    expect(levelFromMinutes(46, 1)).toBe(3)
    expect(levelFromMinutes(0, 0)).toBe(0)
    expect(levelFromMinutes(0, 1)).toBe(1)
    const mins = [24, 25, 45, 46]
    const sessions = mins.map((m, i) => sess(`2026-10-1${2 + i}`, m))
    const out = dayActivities(base({ sessions }))
    expect(mins.map((_, i) => day(out, `2026-10-1${2 + i}`).level)).toEqual([1, 2, 2, 3])
    expect(day(out, '2026-10-16').level).toBe(0)
  })

  it('plusieurs séances le même jour : minutes cumulées', () => {
    const out = dayActivities(base({ sessions: [sess('2026-10-13', 20), sess('2026-10-13', 20)] }))
    expect(day(out, '2026-10-13')).toMatchObject({ sessions: 2, minutes: 40, level: 2 })
  })

  it('séance non done ignorée ; durée plafonnée', () => {
    const out = dayActivities(
      base({
        sessions: [
          sess('2026-10-13', 50, { status: 'abandoned' }),
          sess('2026-10-14', 50, { status: 'in_progress' }),
          sess('2026-10-15', 600),
        ],
      }),
    )
    expect(day(out, '2026-10-13')).toMatchObject({ sessions: 0, level: 0 })
    expect(day(out, '2026-10-14')).toMatchObject({ sessions: 0, level: 0 })
    expect(day(out, '2026-10-15')).toMatchObject({ minutes: 120, level: 3 })
  })

  it('séance sans heures réelles : durée prévue', () => {
    const s = sess('2026-10-13', 0, { startedAt: undefined, endedAt: undefined, durationMin: 30 })
    expect(day(dayActivities(base({ sessions: [s] })), '2026-10-13')).toMatchObject({ minutes: 30, level: 2 })
  })
})

describe('records', () => {
  const first = sess('2026-10-05', 20, { blocks: blocks(12) })
  it('première séance d’un exercice : pas un record', () => {
    const out = dayActivities(base({ from: '2026-10-05', to: '2026-10-05', sessions: [first] }))
    expect(out[0]).toMatchObject({ record: false, level: 1 })
  })
  it('charge supérieure : niveau 4 prioritaire sur la durée, jour de la séance', () => {
    const better = sess('2026-10-14', 50, { blocks: blocks(16) })
    const out = dayActivities(base({ sessions: [first, better] }))
    expect(day(out, '2026-10-14')).toMatchObject({ record: true, level: 4, minutes: 50 })
    expect(day(out, '2026-10-13').record).toBe(false)
  })
  it('séance non done ne bat pas de record', () => {
    const ab = sess('2026-10-14', 50, { blocks: blocks(16), status: 'abandoned' })
    expect(day(dayActivities(base({ sessions: [first, ab] })), '2026-10-14').record).toBe(false)
  })
})

describe('nutrition', () => {
  const d = '2026-10-13'
  const ok = (kcal: number, protein: number) =>
    day(dayActivities(base({ foodLog: [food(d, kcal, protein)] })), d).nutritionOk
  it('dans la cible, bornes ±10 % incluses', () => {
    expect(ok(2500, 150)).toBe(true)
    expect(ok(2250, 135)).toBe(true)
    expect(ok(2750, 165)).toBe(true)
  })
  it('kcal ok mais protéines hors cible, ou l’inverse : false', () => {
    expect(ok(2500, 130)).toBe(false)
    expect(ok(2500, 166)).toBe(false)
    expect(ok(2249, 150)).toBe(false)
    expect(ok(2751, 150)).toBe(false)
  })
  it('somme de plusieurs entrées ; rien logué : null', () => {
    const out = dayActivities(base({ foodLog: [food(d, 1250, 70), food(d, 1250, 80)] }))
    expect(day(out, d).nutritionOk).toBe(true)
    expect(day(out, '2026-10-14').nutritionOk).toBeNull()
  })
  it('objectif protéines à 0 : null', () => {
    const t = () => ({ kcal: 2500, protein: 0 })
    expect(day(dayActivities(base({ foodLog: [food(d, 2500, 0)], targetsFor: t })), d).nutritionOk).toBeNull()
  })
  it('objectifs du jour injectés ; inconnus : null', () => {
    const t = (date: string) => (date === d ? { kcal: 3000, protein: 180 } : null)
    expect(day(dayActivities(base({ foodLog: [food(d, 2500, 150)], targetsFor: t })), d).nutritionOk).toBe(
      false,
    )
    expect(day(dayActivities(base({ foodLog: [food(d, 3000, 180)], targetsFor: t })), d).nutritionOk).toBe(
      true,
    )
    const other = '2026-10-14'
    expect(
      day(dayActivities(base({ foodLog: [food(other, 1, 1)], targetsFor: t })), other).nutritionOk,
    ).toBeNull()
  })
})

describe('plage et jours futurs', () => {
  it('jours futurs : vides, séances et journal ignorés', () => {
    const out = dayActivities(
      base({
        today: '2026-10-14',
        sessions: [sess('2026-10-16', 60)],
        foodLog: [food('2026-10-16', 2500, 150)],
      }),
    )
    expect(out).toHaveLength(7)
    expect(day(out, '2026-10-14').future).toBe(false)
    expect(day(out, '2026-10-15')).toEqual({
      date: '2026-10-15',
      level: 0,
      sessions: 0,
      minutes: 0,
      record: false,
      nutritionOk: null,
      future: true,
    })
    expect(day(out, '2026-10-16')).toMatchObject({ level: 0, future: true, nutritionOk: null })
  })
  it('plage d’un jour, plage inversée, fin d’année', () => {
    expect(dayActivities(base({ from: '2026-10-13', to: '2026-10-13' }))).toHaveLength(1)
    expect(dayActivities(base({ from: '2026-10-14', to: '2026-10-13' }))).toEqual([])
    const out = dayActivities(base({ from: '2026-12-30', to: '2027-01-02', today: '2027-01-01' }))
    expect(out.map((a) => a.date)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(out.map((a) => a.future)).toEqual([false, false, false, true])
  })
  it('84 jours : niveaux par jour et record dans la plage', () => {
    const sessions = [
      sess('2026-08-03', 20, { blocks: blocks(12) }),
      sess('2026-08-10', 30),
      sess('2026-09-07', 60),
      sess('2026-10-05', 20, { blocks: blocks(16) }),
    ]
    const out = dayActivities(base({ from: '2026-07-27', to: '2026-10-18', sessions }))
    expect(out).toHaveLength(84)
    const expected: Record<string, number> = {
      '2026-08-03': 1,
      '2026-08-10': 2,
      '2026-09-07': 3,
      '2026-10-05': 4,
    }
    for (const a of out) expect(a.level).toBe(expected[a.date] ?? 0)
    expect(out.filter((a) => a.record).map((a) => a.date)).toEqual(['2026-10-05'])
  })
  it('séance done après today mais dans la plage, avec record : ignorée', () => {
    const sessions = [
      sess('2026-10-05', 20, { blocks: blocks(12) }),
      sess('2026-10-16', 50, { blocks: blocks(20) }),
    ]
    const out = dayActivities(base({ today: '2026-10-14', sessions }))
    expect(day(out, '2026-10-16')).toMatchObject({ level: 0, record: false, sessions: 0, future: true })
  })
})
