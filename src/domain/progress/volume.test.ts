import { describe, expect, it } from 'vitest'
import { MUSCLE_GROUPS, weeklyVolume } from '../training/volume'
import { defaultSettings, doneSession, makeEquipment, seedLibrary } from '../training/testkit'
import { groupVolumes, volumeStatus } from './volume'

const lib = seedLibrary()
const byId = new Map(lib.map((e) => [e.id, e]))

describe('volumeStatus', () => {
  it('below / within / above, bornes incluses ; [0, 0] = untracked', () => {
    expect(volumeStatus(7.5, [8, 12])).toBe('below')
    expect(volumeStatus(8, [8, 12])).toBe('within')
    expect(volumeStatus(12, [8, 12])).toBe('within')
    expect(volumeStatus(12.5, [8, 12])).toBe('above')
    expect(volumeStatus(0, [0, 0])).toBe('untracked')
    expect(volumeStatus(6, [0, 0])).toBe('untracked')
    expect(volumeStatus(0, [0, 4])).toBe('within')
  })
})

describe('groupVolumes', () => {
  const today = '2026-10-16'
  const sessions = [
    doneSession('2026-10-10', [['box-goblet-squat', 4]]),
    doneSession('2026-10-14', [
      ['box-goblet-squat', 5],
      ['incline-push-up', 3],
    ]),
    doneSession('2026-10-09', [['box-goblet-squat', 10]]), // hors des 7 jours
    doneSession('2026-10-15', [['box-goblet-squat', 10]], { status: 'abandoned' }),
  ]

  it('séries 7 j du moteur vs cibles effectives, ordre de MUSCLE_GROUPS', () => {
    const out = groupVolumes(sessions, byId, defaultSettings(), makeEquipment(), today)
    expect(out.map((g) => g.group)).toEqual([...MUSCLE_GROUPS])
    const volume = weeklyVolume(sessions, lib, today)
    for (const g of out) expect(g.sets).toBe(volume[g.group])
    const quads = out.find((g) => g.group === 'quads')
    expect(quads).toEqual({ group: 'quads', sets: 9, target: [8, 12], status: 'within' })
    expect(out.find((g) => g.group === 'chest')?.status).toBe('below')
    expect(out.find((g) => g.group === 'back')?.target).toEqual([10, 14]) // sans barre
    expect(out.find((g) => g.group === 'forearms')?.status).toBe('untracked')
  })

  it('cible réglée par l’utilisateur et barre de traction prises en compte', () => {
    const out = groupVolumes(
      sessions,
      byId,
      defaultSettings({ volumeTargets: { quads: [4, 6], forearms: [2, 4] } }),
      makeEquipment(['mat', 'pullup_bar']),
      today,
    )
    expect(out.find((g) => g.group === 'quads')).toMatchObject({ target: [4, 6], status: 'above' })
    expect(out.find((g) => g.group === 'forearms')).toMatchObject({ target: [2, 4], status: 'below' })
    expect(out.find((g) => g.group === 'back')?.target).toEqual([8, 12])
  })

  it('exercice inconnu ignoré ; historique vide = 0 partout', () => {
    const out = groupVolumes(
      [doneSession(today, [['unknown-ex', 5]])],
      byId,
      defaultSettings(),
      makeEquipment(),
      today,
    )
    expect(out.every((g) => g.sets === 0)).toBe(true)
  })
})

describe('groupVolumes : bornes', () => {
  it('séance du jour J-6 comptée, J-7 non ; groupe [0,0] reste untracked même avec des séries', () => {
    const today = '2026-10-16'
    const out = groupVolumes(
      [
        doneSession('2026-10-10', [['box-goblet-squat', 3]]),
        doneSession('2026-10-09', [['box-goblet-squat', 3]]),
      ],
      byId,
      defaultSettings({ volumeTargets: { quads: [0, 0] } }),
      makeEquipment(),
      today,
    )
    const quads = out.find((g) => g.group === 'quads')
    expect(quads).toMatchObject({ sets: 3, target: [0, 0], status: 'untracked' })
  })
})
