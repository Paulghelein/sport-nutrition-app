import { describe, expect, it } from 'vitest'
import type { Measurement } from '../../types'
import {
  draftToMeasurement,
  measurementPatch,
  measurementToDraft,
  newMeasurementDraft,
  sortMeasurements,
} from './measurementDraft'

const TODAY = '2026-10-16'

describe('draftToMeasurement', () => {
  it('lit les virgules et ignore les champs vides', () => {
    const d = newMeasurementDraft(TODAY)
    d.values.armCm = '34,5'
    d.values.waistCm = '80'
    d.note = '  matin '
    expect(draftToMeasurement(d, TODAY)).toEqual({
      ok: true,
      input: { date: TODAY, armCm: 34.5, waistCm: 80, note: 'matin' },
    })
  })
  it('refuse un draft vide, un texte illisible, une valeur hors bornes et une date future', () => {
    const d = newMeasurementDraft(TODAY)
    expect(draftToMeasurement(d, TODAY).ok).toBe(false)
    d.values.armCm = 'abc'
    expect(draftToMeasurement(d, TODAY)).toMatchObject({ ok: false, error: expect.stringContaining('Bras') })
    d.values.armCm = '5'
    expect(draftToMeasurement(d, TODAY).ok).toBe(false)
    d.values.armCm = '34'
    d.date = '2026-10-17'
    expect(draftToMeasurement(d, TODAY).ok).toBe(false)
  })
  it('aller-retour et patch qui efface les champs vidés', () => {
    const m = { id: 'm', date: '2026-10-01', armCm: 33, chestCm: 100, createdAt: 'x' } as Measurement
    const d = measurementToDraft(m)
    expect(d.values.armCm).toBe('33')
    d.values.chestCm = ''
    const r = draftToMeasurement(d, TODAY)
    expect(r.ok && measurementPatch(r.input)).toMatchObject({ armCm: 33, chestCm: undefined })
    expect(r.ok && 'chestCm' in measurementPatch(r.input)).toBe(true)
  })
})

describe('sortMeasurements', () => {
  it('plus récent d’abord', () => {
    const rows = [
      { id: 'a', date: '2026-10-01', createdAt: '1' },
      { id: 'b', date: '2026-10-10', createdAt: '1' },
    ] as Measurement[]
    expect(sortMeasurements(rows).map((r) => r.id)).toEqual(['b', 'a'])
  })
})
