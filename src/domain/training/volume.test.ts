import { describe, expect, it } from 'vitest'
import type { Exercise, Session } from '../../types/training'
import { defaultSettings, doneSession, makeEquipment, seedLibrary } from './testkit'
import {
  DEFAULT_VOLUME_TARGETS,
  MAJOR_GROUPS,
  RECENT_FATIGUE_THRESHOLD,
  addExerciseVolume,
  emptyVolume,
  fatiguedGroups,
  recentPrimarySets,
  volumeTargets,
  weeklyVolume,
} from './volume'

const library = seedLibrary()
const TODAY = '2026-10-15'

describe('weeklyVolume', () => {
  it('primaire = 1, secondaire = 0,5 par série faite', () => {
    // goblet-squat : quads + glutes / hamstrings, lower_back, abs
    const v = weeklyVolume([doneSession(TODAY, [['goblet-squat', 3]])], library, TODAY)
    expect(v.quads).toBe(3)
    expect(v.glutes).toBe(3)
    expect(v.hamstrings).toBe(1.5)
    expect(v.abs).toBe(1.5)
    expect(v.chest).toBe(0)
  })

  it('fenêtre glissante [today − 6, today] ; séances futures ignorées', () => {
    const sessions = [
      doneSession('2026-10-09', [['goblet-squat', 1]]), // today − 6 : compté
      doneSession('2026-10-08', [['goblet-squat', 10]]), // today − 7 : exclu
      doneSession('2026-10-16', [['goblet-squat', 10]]), // demain : exclu
    ]
    expect(weeklyVolume(sessions, library, TODAY).quads).toBe(1)
  })

  it('seules les séries done des séances done comptent', () => {
    const s = doneSession(TODAY, [['goblet-squat', 2]])
    const block = s.blocks[0]
    block?.exercises[0]?.sets.push({ status: 'skipped' }, {})
    const inProgress: Session = {
      ...doneSession(TODAY, [['goblet-squat', 5]]),
      id: 'x',
      status: 'in_progress',
    }
    const abandoned: Session = { ...doneSession(TODAY, [['goblet-squat', 5]]), id: 'y', status: 'abandoned' }
    expect(weeklyVolume([s, inProgress, abandoned], library, TODAY).quads).toBe(2)
  })

  it('un exercice inconnu de la bibliothèque est ignoré', () => {
    const v = weeklyVolume([doneSession(TODAY, [['inconnu', 5]])], library, TODAY)
    expect(Object.values(v).every((n) => n === 0)).toBe(true)
  })

  it('un groupe à la fois primaire et secondaire compte une seule fois en primaire', () => {
    const v = emptyVolume()
    const ex: Pick<Exercise, 'muscles'> = {
      muscles: { primary: ['abs'], secondary: ['abs', 'abs', 'quads'] },
    }
    addExerciseVolume(v, ex, 2)
    expect(v.abs).toBe(2)
    expect(v.quads).toBe(1)
  })
})

describe('cibles de volume', () => {
  it('grands groupes 8–12, petits groupes 4–8, sans priorité propre 0', () => {
    for (const g of MAJOR_GROUPS) expect(DEFAULT_VOLUME_TARGETS[g]).toEqual([8, 12])
    for (const g of ['biceps', 'triceps', 'abs', 'calves'] as const)
      expect(DEFAULT_VOLUME_TARGETS[g]).toEqual([4, 8])
    for (const g of ['forearms', 'traps', 'lower_back'] as const)
      expect(DEFAULT_VOLUME_TARGETS[g]).toEqual([0, 0])
  })

  it('dos 10–14 sans barre de traction, 8–12 avec', () => {
    expect(volumeTargets(defaultSettings(), makeEquipment(['mat'])).back).toEqual([10, 14])
    expect(volumeTargets(defaultSettings(), makeEquipment(['mat', 'pullup_bar'])).back).toEqual([8, 12])
  })

  it('les réglages de l’utilisateur passent par-dessus', () => {
    const t = volumeTargets(
      defaultSettings({ volumeTargets: { back: [6, 9], biceps: [8, 10] } }),
      makeEquipment(),
    )
    expect(t.back).toEqual([6, 9])
    expect(t.biceps).toEqual([8, 10])
    expect(t.chest).toEqual([8, 12])
  })
})

describe('fatigue récente (< 48 h)', () => {
  it('compte les séries primaires d’aujourd’hui et d’hier seulement', () => {
    const sessions = [
      doneSession(TODAY, [['goblet-squat', 2]]),
      doneSession('2026-10-14', [['goblet-squat', 2]]),
      doneSession('2026-10-13', [['goblet-squat', 9]]),
    ]
    const r = recentPrimarySets(sessions, library, TODAY)
    expect(r.quads).toBe(4)
    expect(r.hamstrings).toBe(0) // secondaire : non compté
  })

  it(`groupe fatigué à partir de ${RECENT_FATIGUE_THRESHOLD} séries`, () => {
    expect(
      fatiguedGroups([doneSession('2026-10-14', [['goblet-squat', 3]])], library, TODAY).has('quads'),
    ).toBe(false)
    const f = fatiguedGroups([doneSession('2026-10-14', [['goblet-squat', 4]])], library, TODAY)
    expect([...f].sort()).toEqual(['glutes', 'quads'])
  })
})
