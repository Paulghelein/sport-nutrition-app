import { describe, expect, it } from 'vitest'
import type { FoodLogEntry, MealSlot } from '../../types/nutrition'
import type { Session } from '../../types/training'
import { T0, seedLibrary } from '../training/testkit'
import { daySummary } from './daySummary'
import type { DaySummaryInput } from './daySummary'

const byId = new Map(seedLibrary().map((e) => [e.id, e]))
let seq = 0

function sess(date: string, loadKg: number, min = 30, startHour = 10): Session {
  seq += 1
  const start = new Date(`2026-10-12T${String(startHour).padStart(2, '0')}:00:00.000Z`)
  return {
    id: `d${seq}`,
    date,
    durationMin: 30,
    status: 'done',
    warmup: [],
    blocks: [
      {
        id: 'b',
        kind: 'single',
        exercises: [
          {
            exerciseId: 'box-goblet-squat',
            restSec: 60,
            sets: [1, 2].map(() => ({
              status: 'done' as const,
              actualReps: 10,
              feeling: 'ok' as const,
              loadKg,
            })),
          },
          { exerciseId: 'push-up', restSec: 60, sets: [{ status: 'skipped' as const }] },
        ],
      },
    ],
    deload: false,
    estimatedMin: 30,
    updatedAt: T0,
    startedAt: start.toISOString(),
    endedAt: new Date(start.getTime() + min * 60_000).toISOString(),
  }
}

let eid = 0
const food = (
  date: string,
  slot: MealSlot,
  name: string,
  kcal: number,
  protein: number,
  at = 0,
): FoodLogEntry => ({
  id: `fd${++eid}`,
  date,
  slot,
  name,
  origin: { kind: 'free' },
  macros: { kcal, protein, carbs: 0, fat: 0 },
  createdAt: new Date(Date.UTC(2026, 9, 14, 8, at)).toISOString(),
})

const base = (over: Partial<DaySummaryInput> = {}): DaySummaryInput => ({
  date: '2026-10-14',
  today: '2026-10-16',
  sessions: [],
  exercisesById: byId,
  foodLog: [],
  targetsFor: () => ({ kcal: 2500, protein: 150 }),
  ...over,
})

describe('daySummary', () => {
  it('jour vide : rien, nutrition non évaluée', () => {
    const s = daySummary(base())
    expect(s).toMatchObject({ level: 0, sessions: [], meals: [], nutritionOk: null, future: false })
    expect(s.totals).toEqual({ kcal: 0, protein: 0 })
    expect(s.targets).toEqual({ kcal: 2500, protein: 150 })
  })

  it('séance : minutes, séries faites (pas les passées), exercices faits, record', () => {
    const before = sess('2026-10-10', 10)
    const day = sess('2026-10-14', 14, 32)
    const s = daySummary(base({ sessions: [before, day] }))
    expect(s.level).toBe(4)
    expect(s.sessions).toHaveLength(1)
    const only = s.sessions[0]
    expect(only).toMatchObject({ id: day.id, minutes: 32, setsDone: 2, exerciseIds: ['box-goblet-squat'] })
    expect(only?.records.map((r) => r.kind)).toContain('load')
  })

  it('première séance : pas de record ; deux séances le même jour triées par heure', () => {
    const a = sess('2026-10-14', 10, 20, 9)
    const b = sess('2026-10-14', 10, 20, 17)
    const s = daySummary(base({ sessions: [b, a] }))
    expect(s.sessions.map((x) => x.id)).toEqual([a.id, b.id])
    expect(s.sessions[0]?.records).toEqual([])
    expect(s.level).toBe(2)
  })

  it('repas : non vides seulement, ordre de la journée, totaux et cible', () => {
    const log = [
      food('2026-10-14', 'dinner', 'Pâtes', 900, 40, 3),
      food('2026-10-14', 'breakfast', 'Skyr', 300, 30, 1),
      food('2026-10-14', 'breakfast', 'Pain', 200, 6, 2),
      food('2026-10-15', 'lunch', 'Autre jour', 999, 99),
    ]
    const s = daySummary(base({ foodLog: log }))
    expect(s.meals.map((m) => m.slot)).toEqual(['breakfast', 'dinner'])
    expect(s.meals[0]).toMatchObject({ kcal: 500, protein: 36, names: ['Skyr', 'Pain'] })
    expect(s.totals).toEqual({ kcal: 1400, protein: 76 })
    expect(s.nutritionOk).toBe(false)
  })

  it('nutrition dans la cible (même règle que le calendrier)', () => {
    const s = daySummary(base({ foodLog: [food('2026-10-14', 'lunch', 'Tout', 2600, 140)] }))
    expect(s.nutritionOk).toBe(true)
  })

  it('objectifs inconnus : targets null', () => {
    const s = daySummary(
      base({ targetsFor: () => null, foodLog: [food('2026-10-14', 'lunch', 'x', 100, 5)] }),
    )
    expect(s.targets).toBeNull()
    expect(s.nutritionOk).toBeNull()
    expect(s.totals.kcal).toBe(100)
  })

  it('jour futur : vide, rien lu', () => {
    const s = daySummary(
      base({
        date: '2026-10-17',
        sessions: [sess('2026-10-17', 10)],
        foodLog: [food('2026-10-17', 'lunch', 'x', 1, 1)],
      }),
    )
    expect(s).toMatchObject({ future: true, level: 0, sessions: [], meals: [], targets: null })
  })

  it('séance abandonnée ou en cours : exclue du résumé et du niveau', () => {
    const ab = { ...sess('2026-10-14', 14, 30), status: 'abandoned' as const }
    const ip = { ...sess('2026-10-14', 14, 30), status: 'in_progress' as const }
    const s = daySummary(base({ sessions: [ab, ip] }))
    expect(s.sessions).toEqual([])
    expect(s.level).toBe(0)
  })

  it('objectif à 0 : targets null (pas de division par zéro)', () => {
    const s = daySummary(base({ targetsFor: () => ({ kcal: 0, protein: 0 }) }))
    expect(s.targets).toBeNull()
  })
})
