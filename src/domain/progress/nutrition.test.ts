import { describe, expect, it } from 'vitest'
import type { FoodLogEntry } from '../../types/nutrition'
import { nutritionWeek } from './nutrition'

let n = 0
const e = (date: string, kcal: number, protein: number): FoodLogEntry => ({
  id: `e${n++}`,
  date,
  slot: 'lunch',
  name: 'x',
  origin: { kind: 'free' },
  macros: { kcal, protein, carbs: 0, fat: 0 },
  createdAt: '2026-10-05T12:00:00.000Z',
})
const T = { kcal: 3000, protein: 140 }

describe('nutritionWeek', () => {
  it('semaine vide : moyennes null', () => {
    const w = nutritionWeek([], '2026-10-05', '2026-10-11', T)
    expect(w).toMatchObject({
      daysLogged: 0,
      avgKcal: null,
      avgProtein: null,
      daysInTarget: 0,
      targetKcal: 3000,
    })
  })
  it('jours partiels : moyenne sur les jours logués seulement', () => {
    const w = nutritionWeek(
      [
        e('2026-10-05', 1000, 50),
        e('2026-10-05', 1000, 50),
        e('2026-10-07', 3000, 150),
        e('2026-10-20', 9999, 1),
      ],
      '2026-10-05',
      '2026-10-11',
      T,
    )
    expect(w.daysLogged).toBe(2)
    expect(w.avgKcal).toBe(2500)
    expect(w.avgProtein).toBe(125)
    expect(w.daysInTarget).toBe(1)
  })
  it('tolérance ±10 % bornes incluses', () => {
    const w = nutritionWeek(
      [
        e('2026-10-05', 2700, 0),
        e('2026-10-06', 3300, 0),
        e('2026-10-07', 2699, 0),
        e('2026-10-08', 3301, 0),
      ],
      '2026-10-05',
      '2026-10-11',
      T,
    )
    expect(w.daysInTarget).toBe(2)
  })
})

describe('nutritionWeek : bornes', () => {
  it('entrées avant la période ignorées, bornes from/to incluses', () => {
    const w = nutritionWeek(
      [e('2026-10-04', 5000, 99), e('2026-10-05', 3000, 100), e('2026-10-11', 3000, 200), e('2026-10-12', 1, 1)],
      '2026-10-05',
      '2026-10-11',
      T,
    )
    expect(w.daysLogged).toBe(2)
    expect(w.avgProtein).toBe(150)
    expect(w.daysInTarget).toBe(2)
  })
  it('objectif kcal nul : aucun jour dans la cible', () => {
    const w = nutritionWeek([e('2026-10-05', 0, 0)], '2026-10-05', '2026-10-11', { kcal: 0, protein: 0 })
    expect(w.daysInTarget).toBe(0)
    expect(w.daysLogged).toBe(1)
  })
})
