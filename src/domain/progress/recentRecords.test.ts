import { describe, expect, it } from 'vitest'
import type { Session, SetEntry } from '../../types/training'
import { T0, seedLibrary } from '../training/testkit'
import { recentRecords } from './recentRecords'

const byId = new Map(seedLibrary().map((e) => [e.id, e]))
let seq = 0

function sess(date: string, exerciseId: string, sets: SetEntry[], hour = 10): Session {
  seq += 1
  return {
    id: `r${seq}`,
    date,
    durationMin: 30,
    status: 'done',
    warmup: [],
    blocks: [{ id: 'b', kind: 'single', exercises: [{ exerciseId, restSec: 60, sets }] }],
    deload: false,
    estimatedMin: 30,
    updatedAt: T0,
    startedAt: new Date(Date.UTC(2026, 9, 1, hour)).toISOString(),
  }
}
const done = (loadKg: number, reps: number): SetEntry => ({
  status: 'done',
  actualReps: reps,
  feeling: 'ok',
  loadKg,
})

describe('recentRecords', () => {
  it('aucun record sans historique, ni au premier passage', () => {
    expect(recentRecords([], '2026-09-01', '2026-10-16', byId)).toEqual([])
    const only = [sess('2026-10-10', 'box-goblet-squat', [done(12, 10)])]
    expect(recentRecords(only, '2026-09-01', '2026-10-16', byId)).toEqual([])
  })

  it('du plus récent au plus ancien, avec la date de la séance', () => {
    const list = [
      sess('2026-10-01', 'box-goblet-squat', [done(10, 10)]),
      sess('2026-10-08', 'box-goblet-squat', [done(12, 10)]),
      sess('2026-10-13', 'box-goblet-squat', [done(14, 10)]),
    ]
    const out = recentRecords(list, '2026-09-01', '2026-10-16', byId)
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]?.date).toBe('2026-10-13')
    const dates = out.map((r) => r.date)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it('un même record battu deux fois ne sort qu’une fois, le plus récent', () => {
    const list = [
      sess('2026-10-01', 'box-goblet-squat', [done(10, 10)]),
      sess('2026-10-08', 'box-goblet-squat', [done(12, 10)]),
      sess('2026-10-13', 'box-goblet-squat', [done(14, 10)]),
    ]
    const loads = recentRecords(list, '2026-09-01', '2026-10-16', byId).filter(
      (r) => r.record.kind === 'load',
    )
    expect(loads).toHaveLength(1)
    expect(loads[0]).toMatchObject({ date: '2026-10-13' })
    expect(loads[0]?.record.value).toBe(14)
  })

  it('fenêtre : une séance hors plage n’est pas listée mais sert de référence', () => {
    const list = [
      sess('2026-08-01', 'box-goblet-squat', [done(10, 10)]),
      sess('2026-10-13', 'box-goblet-squat', [done(14, 10)]),
    ]
    expect(recentRecords(list, '2026-10-01', '2026-10-16', byId).length).toBeGreaterThan(0)
    expect(recentRecords(list, '2026-10-14', '2026-10-16', byId)).toEqual([])
  })

  it('limite', () => {
    const list = [
      sess('2026-10-01', 'box-goblet-squat', [done(10, 10)]),
      sess('2026-10-13', 'box-goblet-squat', [done(14, 12)]),
    ]
    expect(recentRecords(list, '2026-09-01', '2026-10-16', byId, 1)).toHaveLength(1)
  })

  it('record de série en temps fixe : fenêtre conservée', () => {
    const timed = (reps: number): SetEntry => ({
      status: 'done',
      actualReps: reps,
      feeling: 'ok',
      setType: 'timedMax',
      targetDurationSec: 45,
      loadKg: 12,
    })
    const list = [
      sess('2026-10-01', 'two-hand-swing', [timed(30)]),
      sess('2026-10-13', 'two-hand-swing', [timed(36)]),
    ]
    const out = recentRecords(list, '2026-09-01', '2026-10-16', byId)
    expect(out.some((r) => r.record.windowSec === 45 && r.record.value === 36)).toBe(true)
  })
})
