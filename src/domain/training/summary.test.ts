import { describe, expect, it } from 'vitest'
import type { Session, SessionBlock, SetEntry } from '../../types/training'
import { compareSessionTime, historyItems, summarizeSession } from './summary'
import { T0, seedLibrary } from './testkit'

const lib = seedLibrary()

const done = (actualReps: number, loadKg?: number, feeling: SetEntry['feeling'] = 'ok'): SetEntry => ({
  targetReps: [8, 12],
  status: 'done',
  actualReps,
  feeling,
  ...(loadKg !== undefined ? { loadKg } : {}),
})

function session(id: string, date: string, blocks: SessionBlock[], over: Partial<Session> = {}): Session {
  return {
    id,
    date,
    durationMin: 30,
    status: 'done',
    warmup: [],
    blocks,
    deload: false,
    estimatedMin: 30,
    updatedAt: T0,
    ...over,
  }
}

const single = (id: string, exerciseId: string, sets: SetEntry[]): SessionBlock => ({
  id,
  kind: 'single',
  exercises: [{ exerciseId, restSec: 60, sets }],
})

describe('summarizeSession', () => {
  it('totaux, tonnage (kettlebell en reps), volume, durée réelle ; séries fusionnées par exercice', () => {
    const s = session(
      's1',
      '2026-10-15',
      [
        single('b1', 'box-goblet-squat', [
          done(10, 12),
          done(8, 14),
          { targetReps: [8, 12], status: 'skipped' },
        ]),
        single('b2', 'incline-push-up', [done(12), done(10)]),
        single('b3', 'box-goblet-squat', [done(6, 14)]),
        {
          id: 'b4',
          kind: 'single',
          exercises: [
            { exerciseId: 'plank', restSec: 60, sets: [{ status: 'done', actualDurationSec: 30 }] },
          ],
        },
      ],
      { startedAt: '2026-10-15T18:00:00.000Z', endedAt: '2026-10-15T18:31:40.000Z' },
    )
    const sum = summarizeSession(s, lib, [])
    expect(sum.actualMin).toBe(32)
    expect(sum.setsDone).toBe(6)
    expect(sum.setsSkipped).toBe(1)
    expect(sum.totalReps).toBe(10 + 8 + 12 + 10 + 6)
    expect(sum.tonnageKg).toBe(120 + 112 + 84)
    expect(sum.exercises.map((e) => e.exerciseId)).toEqual(['box-goblet-squat', 'incline-push-up', 'plank'])
    expect(sum.exercises[0]).toEqual({
      exerciseId: 'box-goblet-squat',
      setsDone: 3,
      setsSkipped: 1,
      totalReps: 24,
      totalDurationSec: 0,
      tonnageKg: 316,
      topLoadKg: 14,
    })
    expect(sum.exercises[2]?.totalDurationSec).toBe(30)
    expect(sum.volume.quads).toBe(3)
    expect(sum.volume.chest).toBe(2)
    expect(sum.records).toEqual([])
  })

  it('durée réelle absente sans endedAt', () => {
    expect(summarizeSession(session('s', '2026-10-15', []), lib, []).actualMin).toBeUndefined()
  })

  it('pas de record au premier passage ; records au 2e passage (charge, reps à charge égale, tonnage)', () => {
    const first = session('a', '2026-10-13', [single('b1', 'box-goblet-squat', [done(10, 12), done(10, 12)])])
    const second = session('b', '2026-10-15', [
      single('b1', 'box-goblet-squat', [done(12, 12), done(8, 13), done(8, 13)]),
    ])
    expect(summarizeSession(first, lib, [first, second]).records).toEqual([])
    const rec = summarizeSession(second, lib, [first, second]).records
    expect(rec).toContainEqual({ exerciseId: 'box-goblet-squat', kind: 'load', value: 13, previous: 12 })
    expect(rec).toContainEqual({
      exerciseId: 'box-goblet-squat',
      kind: 'reps',
      value: 12,
      previous: 10,
      loadKg: 12,
    })
    expect(rec).toContainEqual({ exerciseId: 'box-goblet-squat', kind: 'tonnage', value: 352, previous: 240 })
    // Nouvelle charge (13 kg) : rien à battre en répétitions.
    expect(rec.filter((r) => r.kind === 'reps')).toHaveLength(1)
  })

  it('poids du corps et durée : records sans charge', () => {
    const a = session('a', '2026-10-13', [
      single('b1', 'incline-push-up', [done(10)]),
      {
        id: 'b2',
        kind: 'single',
        exercises: [{ exerciseId: 'plank', restSec: 60, sets: [{ status: 'done', actualDurationSec: 30 }] }],
      },
    ])
    const b = session('b', '2026-10-14', [
      single('b1', 'incline-push-up', [done(11)]),
      {
        id: 'b2',
        kind: 'single',
        exercises: [{ exerciseId: 'plank', restSec: 60, sets: [{ status: 'done', actualDurationSec: 35 }] }],
      },
    ])
    expect(summarizeSession(b, lib, [a]).records).toEqual([
      { exerciseId: 'incline-push-up', kind: 'reps', value: 11, previous: 10 },
      { exerciseId: 'plank', kind: 'duration', value: 35, previous: 30 },
    ])
  })

  it('seules les séances done antérieures comptent (séance elle-même, abandonnées et postérieures exclues)', () => {
    const cur = session('cur', '2026-10-15', [single('b1', 'incline-push-up', [done(12)])], {
      startedAt: '2026-10-15T18:00:00.000Z',
    })
    const later = session('later', '2026-10-15', [single('b1', 'incline-push-up', [done(20)])], {
      startedAt: '2026-10-15T19:00:00.000Z',
    })
    const abandoned = session('ab', '2026-10-14', [single('b1', 'incline-push-up', [done(30)])], {
      status: 'abandoned',
    })
    const corrected = { ...cur, blocks: [single('b1', 'incline-push-up', [done(5)])] }
    expect(summarizeSession(cur, lib, [later, abandoned, corrected]).records).toEqual([])
    const morning = session('m', '2026-10-15', [single('b1', 'incline-push-up', [done(10)])], {
      startedAt: '2026-10-15T07:00:00.000Z',
    })
    expect(summarizeSession(cur, lib, [morning, later]).records).toEqual([
      { exerciseId: 'incline-push-up', kind: 'reps', value: 12, previous: 10 },
    ])
  })

  it('pas de record égalé, ni sur des séries passées', () => {
    const a = session('a', '2026-10-13', [single('b1', 'incline-push-up', [done(10)])])
    const b = session('b', '2026-10-14', [
      single('b1', 'incline-push-up', [done(10), { status: 'skipped', actualReps: 50 }]),
    ])
    expect(summarizeSession(b, lib, [a]).records).toEqual([])
  })

  it('tonnage d’un exercice unilatéral × 2 (reps saisies par côté)', () => {
    const s = session('u', '2026-10-15', [single('b1', 'supported-one-arm-row', [done(10, 12)])])
    const sum = summarizeSession(s, lib, [])
    expect(sum.tonnageKg).toBe(240)
    expect(sum.exercises[0]?.totalReps).toBe(10)
  })
})

describe('historyItems', () => {
  it('done et abandoned, plus récentes d’abord, exercices faits sans doublon', () => {
    const list = historyItems([
      session('a', '2026-10-13', [single('b1', 'incline-push-up', [done(10)])]),
      session('p', '2026-10-16', [], { status: 'in_progress' }),
      session('c', '2026-10-15', [single('b1', 'plank', [done(1)])], {
        startedAt: '2026-10-15T07:00:00.000Z',
        endedAt: '2026-10-15T07:20:00.000Z',
      }),
      session(
        'd',
        '2026-10-15',
        [
          single('b1', 'incline-push-up', [done(10), done(9)]),
          single('b2', 'calf-raise', [{ status: 'skipped' }]),
          single('b3', 'incline-push-up', [done(8)]),
        ],
        { startedAt: '2026-10-15T18:00:00.000Z', status: 'abandoned' },
      ),
    ])
    expect(list.map((i) => i.id)).toEqual(['d', 'c', 'a'])
    expect(list[0]).toEqual({
      id: 'd',
      date: '2026-10-15',
      status: 'abandoned',
      durationMin: 30,
      setsDone: 3,
      exerciseIds: ['incline-push-up'],
      startedAt: '2026-10-15T18:00:00.000Z',
    })
    expect(list[1]?.actualMin).toBe(20)
  })

  it('compareSessionTime : date puis startedAt', () => {
    const a = session('a', '2026-10-15', [], { startedAt: '2026-10-15T07:00:00.000Z' })
    const b = session('b', '2026-10-15', [], { startedAt: '2026-10-15T08:00:00.000Z' })
    const c = session('c', '2026-10-14', [], { startedAt: '2026-10-14T23:00:00.000Z' })
    expect(compareSessionTime(a, b)).toBeLessThan(0)
    expect(compareSessionTime(c, a)).toBeLessThan(0)
    expect(compareSessionTime(a, { ...a, id: 'z' })).toBe(0)
  })
})
