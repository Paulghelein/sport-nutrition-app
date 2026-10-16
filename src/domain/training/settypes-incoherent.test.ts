// F3 — séances (ex. issues d'une sauvegarde importée) avec setType incohérent : aucun crash, aucune progression aberrante.
import { describe, expect, it } from 'vitest'
import type { Session, SessionBlock, SetEntry } from '../../types/training'
import { strengthByExercise } from '../progress/strength'
import { estimateMinutes } from './estimate'
import { applySessionResult } from './progression'
import { setTypeOf } from './setTypes'
import { summarizeSession } from './summary'
import { T0, byId, makeEquipment, makeState, seedLibrary } from './testkit'

const library = seedLibrary()
const equipment = makeEquipment()
const index = new Map(library.map((e) => [e.id, e]))

const BAD: SetEntry['setType'][] = ['amrap', 'timedMax', 'time', 'reps']

function sessionWith(exerciseId: string, set: SetEntry): Session {
  const blocks: SessionBlock[] = [
    { id: 'b1', kind: 'single', exercises: [{ exerciseId, restSec: 60, sets: [set, set] }] },
  ]
  return {
    id: `s-${exerciseId}-${String(set.setType)}`,
    date: '2026-10-10',
    durationMin: 45,
    status: 'done',
    warmup: [],
    blocks,
    deload: false,
    estimatedMin: 45,
    updatedAt: T0,
  }
}

describe('F3 — setType incohérent (données importées)', () => {
  for (const ex of library) {
    for (const type of BAD) {
      it(`${ex.id} avec setType=${String(type)} : moteur sans crash, charge finie et bornée`, () => {
        const set: SetEntry = {
          status: 'done',
          feeling: 'ok',
          setType: type,
          targetReps: [8, 12],
          targetDurationSec: 30,
          actualReps: 500,
          actualDurationSec: 900,
          ...(ex.loadType === 'kettlebell' ? { loadKg: 16 } : {}),
        }
        const session = sessionWith(ex.id, set)
        expect(() => setTypeOf(set)).not.toThrow()
        expect(() => estimateMinutes(session.blocks, library, 0)).not.toThrow()
        expect(() => summarizeSession(session, library, [])).not.toThrow()
        expect(() => strengthByExercise([session], index)).not.toThrow()
        const out = applySessionResult({
          exercise: ex,
          state: makeState(ex.id, { loadKg: ex.loadType === 'kettlebell' ? 16 : null }),
          performed: { sets: [set, set] },
          equipment,
          library,
          date: '2026-10-15',
          profileLevel: 1,
        })
        const load = out.state.loadKg
        if (load !== null && load !== undefined) {
          expect(Number.isFinite(load)).toBe(true)
          expect(load).toBeLessThanOrEqual(16 + 4) // au plus un palier de hausse
        }
        // jamais de variante au-delà de profil + 1, jamais le TGU pour un débutant
        if (out.suggestion?.toExerciseId !== undefined) {
          expect(byId(library, out.suggestion.toExerciseId).level).toBeLessThanOrEqual(2)
          expect(out.suggestion.toExerciseId).not.toBe('turkish-get-up')
        }
      })
    }
  }
})
