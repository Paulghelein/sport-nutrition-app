import { describe, expect, it } from 'vitest'
import type { WeighIn } from '../../types/profile'
import { addDays } from '../shared/dates'
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

  it('doublons de date : chaque point moyenne toutes les pesées de la fenêtre, ordre stable', () => {
    const out = weightSeries([w('2026-10-02', 71), w('2026-10-01', 70), w('2026-10-02', 73)])
    expect(out).toEqual([
      { date: '2026-10-01', weightKg: 70, avg7d: 70 },
      { date: '2026-10-02', weightKg: 71, avg7d: 214 / 3 },
      { date: '2026-10-02', weightKg: 73, avg7d: 214 / 3 },
    ])
  })

  it('fenêtre [date-6, date] : la pesée de J-7 sort, celle de J-6 reste', () => {
    const out = weightSeries([w('2026-10-01', 70), w('2026-10-07', 72), w('2026-10-08', 74)])
    expect(out.map((p) => p.avg7d)).toEqual([70, 71, 73])
  })

  /** Ancienne implémentation O(n²), référence de l'équivalence. */
  const reference = (weighIns: WeighIn[]) =>
    [...weighIns]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((x) => ({ date: x.date, weightKg: x.weightKg, avg7d: movingAverage7d(weighIns, x.date) }))

  /** Générateur pseudo-aléatoire à graine fixe (mulberry32). */
  function rng(seed: number): () => number {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it('identique au bit près à l’ancienne version (aléatoire, trous, doublons, désordre)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed)
      const n = Math.floor(r() * 300)
      const list: WeighIn[] = []
      let date = '2025-12-20'
      for (let i = 0; i < n; i++) {
        // pas de 0 (doublon) à 3 jours, et de temps en temps un trou de 1 à 40 jours
        date = addDays(date, r() < 0.08 ? 1 + Math.floor(r() * 40) : Math.floor(r() * 4))
        list.push({ ...w(date, Math.round((60 + r() * 30) * 10) / 10 + r() * 1e-3), id: `${seed}-${i}` })
      }
      // mélange (Fisher-Yates) : l'entrée n'est pas triée
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1))
        ;[list[i], list[j]] = [list[j] as WeighIn, list[i] as WeighIn]
      }
      expect(weightSeries(list)).toEqual(reference(list))
    }
  })

  it('20 000 pesées en temps raisonnable', () => {
    const list = Array.from({ length: 20_000 }, (_, i) => w(addDays('1970-01-01', i), 70 + (i % 10) / 10))
    const t = performance.now()
    expect(weightSeries(list.reverse())).toHaveLength(20_000)
    expect(performance.now() - t).toBeLessThan(2000)
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
