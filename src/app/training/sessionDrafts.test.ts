import { describe, expect, it } from 'vitest'
import type { Equipment, Session } from '../../types'
import { applyDrafts, draftKey, toDraft } from './sessionDrafts'
import type { SetDraft } from './sessionDrafts'

const equipment: Equipment = {
  id: 'me',
  kettlebell: { minKg: 12, maxKg: 24, stepKg: 1 },
  owned: ['mat'],
  updatedAt: '2026-10-15T09:00:00.000Z',
}

function session(): Session {
  return {
    id: 's1',
    date: '2026-10-15',
    durationMin: 30,
    status: 'done',
    warmup: [],
    deload: false,
    estimatedMin: 30,
    updatedAt: '2026-10-15T09:00:00.000Z',
    blocks: [
      {
        id: 'b1',
        kind: 'single',
        exercises: [
          {
            exerciseId: 'goblet-squat',
            restSec: 90,
            sets: [
              { targetReps: [8, 12], loadKg: 16, status: 'done', actualReps: 10, feeling: 'ok' },
              { targetReps: [8, 12], loadKg: 16, status: 'skipped' },
            ],
          },
          {
            exerciseId: 'plank',
            restSec: 60,
            sets: [{ targetDurationSec: 30, status: 'done', actualDurationSec: 30 }],
          },
        ],
      },
    ],
  }
}

function drafts(s: Session): Record<string, SetDraft> {
  const out: Record<string, SetDraft> = {}
  s.blocks.forEach((b, bi) =>
    b.exercises.forEach((e, ei) => e.sets.forEach((set, si) => (out[draftKey(bi, ei, si)] = toDraft(set)))),
  )
  return out
}

describe('applyDrafts', () => {
  it('sans changement, rend les mêmes séries', () => {
    const s = session()
    const r = applyDrafts(s, drafts(s), '', equipment)
    expect('session' in r && r.session.blocks).toEqual(s.blocks)
  })

  it('corrige reps, charge, ressenti et passe une série faite en passée', () => {
    const s = session()
    const d = drafts(s)
    d[draftKey(0, 0, 0)] = { status: 'done', reps: '12', duration: '', load: '18,5', feeling: 'hard' }
    d[draftKey(0, 1, 0)] = { ...(d[draftKey(0, 1, 0)] as SetDraft), status: 'skipped' }
    const r = applyDrafts(s, d, '  bien  ', equipment)
    if (!('session' in r)) throw new Error(r.error)
    expect(r.session.blocks[0]?.exercises[0]?.sets[0]).toMatchObject({
      status: 'done',
      actualReps: 12,
      loadKg: 18.5,
      feeling: 'hard',
    })
    const plank = r.session.blocks[0]?.exercises[1]?.sets[0]
    expect(plank?.status).toBe('skipped')
    expect(plank?.actualDurationSec).toBeUndefined()
    expect(r.session.notes).toBe('bien')
  })

  it('refuse des valeurs hors bornes ou illisibles', () => {
    const s = session()
    const base = drafts(s)
    const bad = (patch: Partial<SetDraft>, key = draftKey(0, 0, 0)) =>
      applyDrafts(s, { ...base, [key]: { ...(base[key] as SetDraft), ...patch } }, '', equipment)
    expect(bad({ reps: '100' })).toHaveProperty('error')
    expect(bad({ reps: '' })).toHaveProperty('error')
    expect(bad({ load: '160' })).toHaveProperty('error')
    expect(bad({ load: 'abc' })).toHaveProperty('error')
    expect(bad({ duration: '601' }, draftKey(0, 1, 0))).toHaveProperty('error')
  })

  it('une série passée n’exige aucune valeur, et les notes vides sont retirées', () => {
    const s = { ...session(), notes: 'ancienne' }
    const d = drafts(s)
    d[draftKey(0, 0, 0)] = { status: 'skipped', reps: '', duration: '', load: '', feeling: '' }
    const r = applyDrafts(s, d, '', equipment)
    if (!('session' in r)) throw new Error(r.error)
    expect(r.session.notes).toBeUndefined()
    expect(r.session.blocks[0]?.exercises[0]?.sets[0]?.actualReps).toBeUndefined()
  })
})
