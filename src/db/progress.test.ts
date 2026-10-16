import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './database'
import { defaultSettings } from './defaults'
import { addMeasurement, upsertWeighIn } from './repositories'
import { loadProgressData } from './progress'
import { NOW, makeFullTables, makeProfile } from './testFixtures'

const EPOCH = '1970-01-01T00:00:00.000Z'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('loadProgressData', () => {
  it('lit tout, séances done seulement, journal sur 35 jours', async () => {
    const t = makeFullTables()
    await db.profile.put(makeProfile())
    await db.settings.put({ ...defaultSettings(NOW), onboardingCompleted: true })
    await upsertWeighIn({ date: '2026-02-01', weightKg: 70 }, NOW)
    await addMeasurement({ date: '2026-02-01', armCm: 33 }, NOW)
    const base = t.sessions[0]
    if (!base) throw new Error('fixture')
    await db.sessions.bulkPut([
      { ...base, id: 's-done', status: 'done' },
      { ...base, id: 's-plan', status: 'planned' },
    ])
    const log = t.foodLog[0]
    if (!log) throw new Error('fixture')
    await db.foodLog.bulkPut([
      { ...log, id: 'l-in', date: '2026-02-25' },
      { ...log, id: 'l-edge', date: '2026-01-26' },
      { ...log, id: 'l-old', date: '2026-01-25' },
      { ...log, id: 'l-future', date: '2026-03-02' },
    ])
    const d = await loadProgressData('2026-03-01')
    expect(d.profile).toBeDefined()
    expect(d.settings.onboardingCompleted).toBe(true)
    expect(d.weighIns).toHaveLength(1)
    expect(d.measurements).toHaveLength(1)
    expect(d.sessions.map((s) => s.id)).toEqual(['s-done'])
    expect(d.foodLog.map((e) => e.id).sort()).toEqual(['l-edge', 'l-in'])
    expect(Array.isArray(d.states) && Array.isArray(d.exerciseRows) && Array.isArray(d.prefs)).toBe(true)
  })

  it('base vide : valeurs par défaut', async () => {
    const d = await loadProgressData('2026-03-01')
    expect(d.profile).toBeUndefined()
    expect(d.sessions).toEqual([])
    expect(d.foodLog).toEqual([])
    expect(d.settings.updatedAt).toBe(EPOCH)
  })
})
