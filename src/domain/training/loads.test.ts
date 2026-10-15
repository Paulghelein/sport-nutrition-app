import { describe, expect, it } from 'vitest'
import { adjustableLoads, isAdjustable, maxLoad, nextLoadDown, nextLoadUp, snapLoadDown } from './loads'

const KB = { minKg: 12, maxKg: 24, stepKg: 1 }
const KB2 = { minKg: 12, maxKg: 24, stepKg: 2 }
const KB4 = { minKg: 8, maxKg: 30, stepKg: 4 } // 8, 12, …, 28 (30 non atteignable)

describe('charges réglables', () => {
  it('liste min + k × pas jusqu’au max', () => {
    expect(adjustableLoads(KB)).toHaveLength(13)
    expect(adjustableLoads(KB4)).toEqual([8, 12, 16, 20, 24, 28])
    expect(adjustableLoads({ minKg: 4, maxKg: 6, stepKg: 0.5 })).toEqual([4, 4.5, 5, 5.5, 6])
    expect(maxLoad(KB4)).toBe(28)
  })

  it('spécification incohérente → seulement le min', () => {
    expect(adjustableLoads({ minKg: 12, maxKg: 24, stepKg: 0 })).toEqual([12])
    expect(adjustableLoads({ minKg: 24, maxKg: 12, stepKg: 1 })).toEqual([24])
  })

  it('valeurs non finies ou pas minuscule : pas de boucle infinie', () => {
    expect(adjustableLoads({ minKg: 12, maxKg: Number.POSITIVE_INFINITY, stepKg: 1 })).toEqual([12])
    expect(adjustableLoads({ minKg: Number.NaN, maxKg: 24, stepKg: 1 })).toEqual([])
    expect(adjustableLoads({ minKg: 12, maxKg: 24, stepKg: Number.NaN })).toEqual([12])
    expect(adjustableLoads({ minKg: 12, maxKg: 24, stepKg: -1 })).toEqual([12])
    expect(adjustableLoads({ minKg: 0, maxKg: 1e9, stepKg: 1e-6 }).length).toBeLessThanOrEqual(1000)
    expect(nextLoadUp(12, 2, { minKg: 12, maxKg: Number.NaN, stepKg: 1 })).toBeNull()
  })

  it('arrondit toujours vers le bas, plancher au min, plafond au max', () => {
    expect(snapLoadDown(13.7, KB)).toBe(13)
    expect(snapLoadDown(15, KB4)).toBe(12)
    expect(snapLoadDown(3, KB)).toBe(12)
    expect(snapLoadDown(40, KB4)).toBe(28)
    expect(isAdjustable(13, KB)).toBe(true)
    expect(isAdjustable(13, KB2)).toBe(false)
  })

  it('hausse d’un palier : jamais plus d’un palier, au moins un pas', () => {
    expect(nextLoadUp(12, 2, KB)).toBe(14)
    expect(nextLoadUp(12, 1, KB)).toBe(13)
    // Pas de la kettlebell (2) > palier (1) : un seul pas.
    expect(nextLoadUp(12, 1, KB2)).toBe(14)
    expect(nextLoadUp(12, 2, KB4)).toBe(16)
    // Plafond : 23 + 2 → 24 ; au max → null.
    expect(nextLoadUp(23, 2, KB)).toBe(24)
    expect(nextLoadUp(24, 2, KB)).toBeNull()
  })

  it('baisse d’un palier, plancher au min', () => {
    expect(nextLoadDown(16, 2, KB)).toBe(14)
    expect(nextLoadDown(13, 2, KB)).toBe(12)
    expect(nextLoadDown(16, 1, KB4)).toBe(12)
    expect(nextLoadDown(12, 2, KB)).toBeNull()
  })
})
