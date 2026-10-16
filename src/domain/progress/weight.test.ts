import { describe, expect, it } from 'vitest'
import type { WeighIn } from '../../types/profile'
import { movingAverage7d, weightSeries, weightSummary, weightTargetCorridor } from './weight'

const w = (date: string, weightKg: number): WeighIn => ({
  id: date,
  date,
  weightKg,
  createdAt: `${date}T08:00:00.000Z`,
})

describe('movingAverage7d', () => {
  it('liste vide -> null', () => {
    expect(movingAverage7d([], '2026-10-15')).toBeNull()
  })
  it('fenêtre [on-6, on] bornes incluses', () => {
    const list = [w('2026-10-08', 70), w('2026-10-09', 72), w('2026-10-15', 74), w('2026-10-16', 99)]
    // 08 exclu (on-7), 16 exclu (futur)
    expect(movingAverage7d(list, '2026-10-15')).toBe(73)
  })
  it('trou de plusieurs jours -> null', () => {
    expect(movingAverage7d([w('2026-10-01', 70)], '2026-10-15')).toBeNull()
  })
})

describe('weightSeries', () => {
  it('vide', () => expect(weightSeries([])).toEqual([]))
  it('une seule pesée', () => {
    expect(weightSeries([w('2026-10-01', 70)])).toEqual([{ date: '2026-10-01', weightKg: 70, avg7d: 70 }])
  })
  it('trie et calcule la moyenne à la date du point', () => {
    const out = weightSeries([w('2026-10-05', 72), w('2026-10-01', 70), w('2026-10-20', 75)])
    expect(out.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-05', '2026-10-20'])
    expect(out.map((p) => p.avg7d)).toEqual([70, 71, 75])
  })
  it("ne mute pas l'entrée", () => {
    const input = [w('2026-10-05', 72), w('2026-10-01', 70)]
    weightSeries(input)
    expect(input[0]?.date).toBe('2026-10-05')
  })
})

describe('weightTargetCorridor', () => {
  it('progression linéaire', () => {
    const out = weightTargetCorridor(70, '2026-10-01', ['2026-10-01', '2026-10-08', '2026-10-15'])
    expect(out[0]).toEqual({ date: '2026-10-01', lowKg: 70, highKg: 70 })
    expect(out[1]?.lowKg).toBeCloseTo(70.175, 10)
    expect(out[1]?.highKg).toBeCloseTo(70.35, 10)
    expect(out[2]?.lowKg).toBeCloseTo(70.35, 10)
    expect(out[2]?.highKg).toBeCloseTo(70.7, 10)
  })
  it('jours intermédiaires et vide', () => {
    expect(weightTargetCorridor(70, '2026-10-01', [])).toEqual([])
    const [p] = weightTargetCorridor(70, '2026-10-01', ['2026-10-04'])
    expect(p?.lowKg).toBeCloseTo(70 * (1 + (0.0025 * 3) / 7), 10)
  })
})

describe('weightSummary', () => {
  it('vide', () => {
    expect(weightSummary([], '2026-10-15')).toEqual({
      latest: null,
      avg7d: null,
      change7dKg: null,
      change28dKg: null,
    })
  })
  it('une pesée : pas de variation', () => {
    const s = weightSummary([w('2026-10-15', 70)], '2026-10-15')
    expect(s.latest?.weightKg).toBe(70)
    expect(s.avg7d).toBe(70)
    expect(s.change7dKg).toBeNull()
    expect(s.change28dKg).toBeNull()
  })
  it('variations 7 j et 28 j', () => {
    const list = [w('2026-09-17', 68), w('2026-10-08', 69), w('2026-10-15', 70), w('2026-10-14', 72)]
    const s = weightSummary(list, '2026-10-15')
    expect(s.latest?.date).toBe('2026-10-15')
    expect(s.avg7d).toBe(71)
    expect(s.change7dKg).toBe(2)
    expect(s.change28dKg).toBe(3)
  })
  it('latest ignore les pesées futures', () => {
    const s = weightSummary([w('2026-10-10', 70), w('2026-10-20', 80)], '2026-10-15')
    expect(s.latest?.date).toBe('2026-10-10')
  })
  it('28 j manquant -> null', () => {
    const s = weightSummary([w('2026-10-08', 69), w('2026-10-15', 70)], '2026-10-15')
    expect(s.change7dKg).toBe(1)
    expect(s.change28dKg).toBeNull()
  })
})
