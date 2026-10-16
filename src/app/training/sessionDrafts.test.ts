import { describe, expect, it } from 'vitest'
import type { Equipment, Session, SetEntry } from '../../types'
import { NO_PLANNED_LOAD, plannedLoad } from '../../domain/training/guided'
import { applyDrafts, byDuration, draftKey, toDraft } from './sessionDrafts'
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

  describe('charge prévue (plannedLoadKg) cohérente après correction', () => {
    /** Séance dont la 1re série a une charge `loadKg` et éventuellement `plannedLoadKg`. */
    function withSet(patch: Partial<SetEntry>): Session {
      const s = session()
      const first = s.blocks[0]?.exercises[0]?.sets[0] as SetEntry
      Object.assign(first, patch)
      return s
    }
    const fix = (s: Session, patch: Partial<SetDraft>) => {
      const d = drafts(s)
      d[draftKey(0, 0, 0)] = { ...(d[draftKey(0, 0, 0)] as SetDraft), ...patch }
      const r = applyDrafts(s, d, '', equipment)
      if (!('session' in r)) throw new Error(r.error)
      return r.session.blocks[0]?.exercises[0]?.sets[0] as SetEntry
    }

    it('plannedLoad suit le contrat de SetEntry', () => {
      expect(plannedLoad({ loadKg: 16 })).toBe(16)
      expect(plannedLoad({ loadKg: 16, plannedLoadKg: 12 })).toBe(12)
      expect(plannedLoad({ loadKg: 8, plannedLoadKg: 0 })).toBeUndefined()
      expect(plannedLoad({})).toBeUndefined()
    })

    it('charge corrigée différente de la prévue : la prévue est gardée', () => {
      const set = fix(withSet({ loadKg: 16 }), { load: '18' })
      expect(set).toMatchObject({ loadKg: 18, plannedLoadKg: 16 })
      expect(plannedLoad(set)).toBe(16)
    })

    it('déjà modifiée en séance (16 au lieu de 12) puis corrigée à 14 : prévue toujours 12', () => {
      const set = fix(withSet({ loadKg: 16, plannedLoadKg: 12 }), { load: '14' })
      expect(set).toMatchObject({ loadKg: 14, plannedLoadKg: 12 })
    })

    it('corrigée pour revenir à la prévue : plannedLoadKg retiré', () => {
      const set = fix(withSet({ loadKg: 16, plannedLoadKg: 12 }), { load: '12' })
      expect(set.loadKg).toBe(12)
      expect(set).not.toHaveProperty('plannedLoadKg')
    })

    it('charge effacée : poids du corps, la prévue reste connue', () => {
      const set = fix(withSet({ loadKg: 16 }), { load: '' })
      expect(set).not.toHaveProperty('loadKg')
      expect(set.plannedLoadKg).toBe(16)
      expect(plannedLoad(set)).toBe(16)
    })

    it('série au poids du corps lestée à la correction : plannedLoadKg 0 ; lest retiré : plus rien', () => {
      const s = session()
      const plank = () => s.blocks[0]?.exercises[1]?.sets[0] as SetEntry
      const d = drafts(s)
      d[draftKey(0, 1, 0)] = { ...(d[draftKey(0, 1, 0)] as SetDraft), load: '8' }
      const r = applyDrafts(s, d, '', equipment)
      if (!('session' in r)) throw new Error(r.error)
      const weighted = r.session.blocks[0]?.exercises[1]?.sets[0] as SetEntry
      expect(weighted).toMatchObject({ loadKg: 8, plannedLoadKg: NO_PLANNED_LOAD })
      expect(weighted.actualDurationSec).toBe(plank().actualDurationSec)

      const d2 = drafts(r.session)
      d2[draftKey(0, 1, 0)] = { ...(d2[draftKey(0, 1, 0)] as SetDraft), load: '' }
      const r2 = applyDrafts(r.session, d2, '', equipment)
      if (!('session' in r2)) throw new Error(r2.error)
      const back = r2.session.blocks[0]?.exercises[1]?.sets[0] as SetEntry
      expect(back).not.toHaveProperty('loadKg')
      expect(back).not.toHaveProperty('plannedLoadKg')
    })

    it('série passée à la correction : charge prévue rétablie (comme skipSet)', () => {
      const set = fix(withSet({ loadKg: 16, plannedLoadKg: 12 }), { status: 'skipped' })
      expect(set).toMatchObject({ status: 'skipped', loadKg: 12 })
      expect(set).not.toHaveProperty('plannedLoadKg')
      const bodyweight = fix(withSet({ loadKg: 8, plannedLoadKg: 0 }), { status: 'skipped' })
      expect(bodyweight).not.toHaveProperty('loadKg')
      expect(bodyweight).not.toHaveProperty('plannedLoadKg')
    })

    it('sans changement : plannedLoadKg conservé tel quel', () => {
      const s = withSet({ loadKg: 16, plannedLoadKg: 12 })
      const r = applyDrafts(s, drafts(s), '', equipment)
      expect('session' in r && r.session.blocks).toEqual(s.blocks)
    })
  })
})

describe('byDuration (type de série via setTypeOf)', () => {
  it('série en durée : durée ; reps : répétitions', () => {
    expect(byDuration({ targetDurationSec: 30 })).toBe(true)
    expect(byDuration({ targetReps: [8, 12] })).toBe(false)
  })
  it('timedMax (fenêtre valide) et amrap se corrigent en répétitions, malgré targetDurationSec', () => {
    expect(byDuration({ setType: 'timedMax', targetDurationSec: 45, actualReps: 24 })).toBe(false)
    expect(byDuration({ setType: 'amrap', targetReps: [8, 12], actualReps: 14 })).toBe(false)
  })
  it('correction d’une série timedMax : garde son type et sa fenêtre, écrit les répétitions', () => {
    const s = session()
    const set: SetEntry = {
      setType: 'timedMax',
      targetDurationSec: 45,
      loadKg: 16,
      status: 'done',
      actualReps: 24,
    }
    const sess: Session = {
      ...s,
      blocks: [
        {
          id: 'b1',
          kind: 'finisher',
          exercises: [{ exerciseId: 'two-hand-swing', restSec: 60, sets: [set] }],
        },
      ],
    }
    const d = drafts(sess)
    d[draftKey(0, 0, 0)] = { ...(d[draftKey(0, 0, 0)] as SetDraft), reps: '26' }
    const r = applyDrafts(sess, d, '', equipment)
    if (!('session' in r)) throw new Error(r.error)
    expect(r.session.blocks[0]?.exercises[0]?.sets[0]).toMatchObject({
      setType: 'timedMax',
      targetDurationSec: 45,
      actualReps: 26,
    })
  })
  it('timedMax sans fenêtre valide : série normale (reps)', () => {
    expect(byDuration({ setType: 'timedMax', targetReps: [8, 12], actualReps: 10 })).toBe(false)
  })
})
