import { describe, expect, it } from 'vitest'
import { seedExercises } from '../src/content'
import { muscleMapPaths } from '../src/content/visuals'
import { chooseMuscleView, zonesFor } from '../src/ui/kit/muscleZones'

const primaryOf = (name: string) => {
  const e = seedExercises.find((x) => x.name === name)
  if (!e) throw new Error(`Exercice introuvable : ${name}`)
  return e.muscles.primary
}

describe('chooseMuscleView', () => {
  it.each([
    ['Goblet squat', 'front'],
    ['Pompes', 'front'],
    ['Développé kettlebell debout', 'front'],
    ['Curl kettlebell deux mains', 'front'],
    ['Planche', 'front'],
    ['Swing kettlebell deux mains', 'back'],
    ['Soulevé de terre kettlebell', 'back'],
    ['Rowing 1 bras avec appui', 'back'],
    ['Tractions', 'back'],
  ] as const)('%s -> %s', (name, view) => {
    expect(chooseMuscleView(primaryOf(name))).toBe(view)
  })

  it('aucun muscle : face ; égalité : vue du premier muscle primaire', () => {
    expect(chooseMuscleView([])).toBe('front')
    expect(chooseMuscleView(['chest', 'triceps'])).toBe('front')
    expect(chooseMuscleView(['triceps', 'chest'])).toBe('back')
    expect(chooseMuscleView(['back', 'biceps'])).toBe('back')
    expect(chooseMuscleView(['forearms', 'traps'])).toBe('front')
  })
})

describe('zonesFor', () => {
  it('mapping des groupes vers les zones', () => {
    expect(zonesFor('front', ['chest', 'shoulders', 'biceps', 'forearms', 'abs', 'quads'])).toEqual([
      'chest',
      'delts',
      'arms',
      'fore',
      'abs',
      'quads',
    ])
    expect(zonesFor('back', ['traps', 'back', 'lower_back', 'hamstrings', 'triceps'])).toEqual([
      'traps',
      'lats',
      'lowerBack',
      'hamstrings',
      'triceps',
    ])
  })
  it('mollets des deux côtés, fessiers : hips de face et glutes de dos', () => {
    expect(zonesFor('front', ['calves', 'glutes'])).toEqual(['calves', 'hips'])
    expect(zonesFor('back', ['calves', 'glutes'])).toEqual(['calves', 'glutes'])
  })
  it('ignore les muscles absents de la vue', () => {
    expect(zonesFor('front', ['hamstrings', 'traps'])).toEqual([])
  })
  it('toutes les zones renvoyées existent dans les tracés', () => {
    const all = [
      'chest',
      'back',
      'shoulders',
      'biceps',
      'triceps',
      'forearms',
      'traps',
      'abs',
      'lower_back',
      'glutes',
      'quads',
      'hamstrings',
      'calves',
    ] as const
    for (const view of ['front', 'back'] as const)
      for (const z of zonesFor(view, all)) expect(muscleMapPaths[view].zones[z]).toBeDefined()
  })
})
