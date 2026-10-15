import { describe, expect, it } from 'vitest'
import type { SessionBlock } from '../../types/training'
import {
  SETUP_SEC,
  SUPERSET_TRANSITION_SEC,
  blockSeconds,
  estimateMinutes,
  estimateSeconds,
  secondsPerRep,
} from './estimate'
import { seedLibrary } from './testkit'

const library = seedLibrary()
const index = new Map(library.map((e) => [e.id, e]))

const single = (
  exerciseId: string,
  n: number,
  restSec: number,
  set: SessionBlock['exercises'][0]['sets'][0],
): SessionBlock => ({
  id: 'b1',
  kind: 'single',
  exercises: [{ exerciseId, restSec, sets: Array.from({ length: n }, () => ({ ...set })) }],
})

describe('estimation de durée', () => {
  it('série = reps (milieu) × 3 s + repos, plus l’installation', () => {
    // goblet-squat bilatéral, [8,12] → 10 × 3 = 30 s
    expect(blockSeconds(single('goblet-squat', 3, 90, { targetReps: [8, 12] }), index)).toBe(
      SETUP_SEC + 3 * (30 + 90),
    )
  })

  it('unilatéral = travail × 2', () => {
    // one-arm-row unilatéral : 2 × 30 s
    expect(blockSeconds(single('one-arm-row', 2, 90, { targetReps: [8, 12] }), index)).toBe(
      SETUP_SEC + 2 * (60 + 90),
    )
  })

  it('durée visée pour le gainage et les portés', () => {
    expect(blockSeconds(single('plank', 3, 60, { targetDurationSec: 30 }), index)).toBe(SETUP_SEC + 3 * 90)
  })

  it('superset : travail des deux + enchaînement + un seul repos (le plus long) par tour', () => {
    const block: SessionBlock = {
      id: 'b1',
      kind: 'superset',
      exercises: [
        { exerciseId: 'goblet-squat', restSec: 90, sets: [{ targetReps: [8, 12] }, { targetReps: [8, 12] }] },
        { exerciseId: 'push-up', restSec: 75, sets: [{ targetReps: [6, 14] }, { targetReps: [6, 14] }] },
      ],
    }
    const round = 30 + 30 + SUPERSET_TRANSITION_SEC + 90
    expect(blockSeconds(block, index)).toBe(2 * SETUP_SEC + 2 * round)
  })

  it('tempo 3-1-1 : 5 s par répétition', () => {
    const b = single('goblet-squat', 3, 90, { targetReps: [8, 12] })
    const se = b.exercises[0]
    if (se) se.tempo = '3-1-1'
    expect(blockSeconds(b, index)).toBe(SETUP_SEC + 3 * (50 + 90))
    expect(secondsPerRep('3-1-1')).toBe(5)
    expect(secondsPerRep(undefined)).toBe(3)
    expect(secondsPerRep('lent')).toBe(3)
  })

  it('les séries passées ne comptent pas', () => {
    const b = single('goblet-squat', 3, 90, { targetReps: [8, 12] })
    const se = b.exercises[0]
    if (se?.sets[0]) se.sets[0].status = 'skipped'
    expect(blockSeconds(b, index)).toBe(SETUP_SEC + 2 * 120)
  })

  it('exercice inconnu : traité comme bilatéral', () => {
    expect(blockSeconds(single('inconnu', 1, 60, { targetReps: [10, 10] }), index)).toBe(SETUP_SEC + 90)
  })

  it('total = échauffement + blocs, arrondi à la minute', () => {
    const blocks = [single('goblet-squat', 3, 90, { targetReps: [8, 12] })] // 420 s
    expect(estimateSeconds(blocks, library, 5)).toBe(300 + 420)
    expect(estimateMinutes(blocks, library, 5)).toBe(12)
  })
})
