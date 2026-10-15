import { describe, expect, it } from 'vitest'
import { generateSession, replacementCandidates } from './generate'
import { patternLevels } from './levels'
import { DURATIONS, makeEquipment, makeInput, makeState, planExerciseIds, seedLibrary } from './testkit'
import { addDays } from '../shared/dates'

const library = seedLibrary()

describe('patternLevels', () => {
  it('niveau du profil par défaut', () => {
    const levels = patternLevels(library, [], 1)
    expect(Object.values(levels).every((l) => l === 1)).toBe(true)
    expect(patternLevels(library, [], 2).core).toBe(2)
  })

  it('max(profil, plus haut niveau parmi les exercices du schéma ayant un état)', () => {
    const levels = patternLevels(library, [makeState('goblet-squat'), makeState('plank')], 1)
    expect(levels.squat).toBe(2)
    expect(levels.core).toBe(1)
    expect(levels.hinge).toBe(1)
    // Le profil reste un plancher.
    expect(patternLevels(library, [makeState('plank')], 2).core).toBe(2)
  })

  it('ignore un état dont l’exercice n’est pas dans la bibliothèque', () => {
    expect(patternLevels(library, [makeState('inconnu')], 1).squat).toBe(1)
  })
})

describe('Turkish get-up (niveau 3, core)', () => {
  it('jamais proposé à un débutant qui n’a pas débloqué le niveau 3 en core', () => {
    const states = [
      makeState('plank'),
      makeState('hollow-hold'),
      makeState('side-plank', { targetDurationSec: 30 }),
    ]
    for (const durationMin of DURATIONS) {
      for (let d = 0; d < 14; d++) {
        for (const s of [[], states]) {
          const plan = generateSession(
            makeInput({
              durationMin,
              date: addDays('2026-10-15', d),
              states: s,
              equipment: makeEquipment(['mat', 'pullup_bar', 'bench', 'table']),
            }),
          )
          expect(planExerciseIds(plan)).not.toContain('turkish-get-up')
        }
      }
    }
    expect(replacementCandidates('plank', makeInput({ states })).map((e) => e.id)).not.toContain(
      'turkish-get-up',
    )
  })

  it('devient proposable une fois le niveau 3 de core débloqué', () => {
    const states = [makeState('turkish-get-up', { loadKg: 12 })]
    expect(replacementCandidates('plank', makeInput({ states })).map((e) => e.id)).toContain('turkish-get-up')
  })
})
