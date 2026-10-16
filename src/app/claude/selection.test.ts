import { describe, expect, it } from 'vitest'
import type { ImportPreviewItem } from '../../types'
import {
  buildSelection,
  defaultSelection,
  outcomeLines,
  planLines,
  selectionSize,
  toggleSelection,
} from './selection'

const recipe = {
  kind: 'recipe',
  index: 0,
  recipe: { name: 'R' },
  warnings: [],
} as unknown as ImportPreviewItem
const meal = {
  kind: 'meal',
  index: 1,
  meal: {
    name: 'Pizza',
    date: '2026-10-16',
    slot: 'dinner',
    estimated: true,
    totals: { kcal: 800, protein: 30, carbs: 90, fat: 30 },
  },
  warnings: [],
} as unknown as ImportPreviewItem
const exercise = {
  kind: 'exercise',
  index: 2,
  exercise: { name: 'Nouveau' },
  warnings: [],
} as unknown as ImportPreviewItem
const pref = {
  kind: 'exercisePreference',
  index: 3,
  preference: { exerciseId: 'goblet-squat', preference: 'liked' },
  warnings: [],
} as unknown as ImportPreviewItem
const plan = (index: number) =>
  ({
    kind: 'sessionPlan',
    index,
    plan: { durationMin: 30, blocks: [], unknownExerciseIds: [] },
    warnings: [],
  }) as unknown as ImportPreviewItem
const invalid: ImportPreviewItem = { kind: 'invalid', index: 8, errors: ['x'] }
const unsupported: ImportPreviewItem = { kind: 'unsupported', index: 9, type: 'foo', message: 'm' }

describe('defaultSelection', () => {
  it('coche tout sauf invalides et non pris en charge', () => {
    const items = [recipe, meal, exercise, pref, plan(4), invalid, unsupported]
    expect([...defaultSelection(items)]).toEqual([0, 1, 2, 3, 4])
  })
  it('une seule séance cochée (la première)', () => {
    expect([...defaultSelection([plan(0), plan(1)])]).toEqual([0])
  })
})

describe('doublon d’exercice', () => {
  it('un exercice dont le nom existe déjà n’est pas coché par défaut', () => {
    const dup = { ...exercise, duplicateOf: 'goblet-squat' } as unknown as ImportPreviewItem
    expect([...defaultSelection([recipe, dup])]).toEqual([0])
  })
})

describe('toggleSelection', () => {
  it('décoche et recoche', () => {
    const items = [recipe, meal]
    const s = toggleSelection(items, new Set([0, 1]), 0, false)
    expect([...s]).toEqual([1])
    expect([...toggleSelection(items, s, 0, true)].sort()).toEqual([0, 1])
  })
  it('cocher une séance décoche l’autre', () => {
    const items = [plan(0), plan(1)]
    expect([...toggleSelection(items, new Set([0]), 1, true)]).toEqual([1])
  })
  it('un élément invalide ne se coche pas', () => {
    expect([...toggleSelection([invalid], new Set(), 8, true)]).toEqual([])
  })
})

describe('buildSelection', () => {
  const items = [recipe, meal, exercise, pref, plan(4), invalid]
  it('répartit les éléments cochés', () => {
    const s = buildSelection(items, new Set([0, 1, 2, 3, 4]))
    expect(s.recipes).toHaveLength(1)
    expect(s.meals[0]?.name).toBe('Pizza')
    expect(s.exercises).toEqual([{ index: 2, exercise: { name: 'Nouveau' } }])
    expect(s.preferences).toEqual([{ exerciseId: 'goblet-squat', preference: 'liked' }])
    expect(s.sessionPlan?.durationMin).toBe(30)
    expect(selectionSize(s)).toBe(5)
  })
  it('ignore les non cochés et les invalides ; champs optionnels absents', () => {
    const s = buildSelection(items, new Set([1, 8]))
    expect(s).toEqual({ recipes: [], meals: [(meal as { meal: unknown }).meal] })
    expect(selectionSize(s)).toBe(1)
    expect(selectionSize(buildSelection(items, new Set()))).toBe(0)
  })
})

describe('outcomeLines', () => {
  it('décrit chaque effet avec les pluriels', () => {
    const lines = outcomeLines({
      recipesCreated: 2,
      mealsLogged: 1,
      exercisesCreated: 1,
      preferencesSet: 3,
      sessionPlanFor: '2026-10-16',
    })
    expect(lines).toEqual([
      '2 recettes créées.',
      '1 repas ajouté au journal.',
      '1 exercice créé dans la bibliothèque.',
      '3 préférences enregistrées.',
      'Séance proposée par Claude enregistrée.',
    ])
  })
  it('séance non appliquée', () => {
    expect(
      outcomeLines({
        recipesCreated: 0,
        mealsLogged: 0,
        exercisesCreated: 0,
        preferencesSet: 0,
        sessionPlanSkipped: true,
      }),
    ).toEqual(['Séance non appliquée : aucun exercice retenu.'])
  })
  it('rien appliqué', () => {
    expect(
      outcomeLines({ recipesCreated: 0, mealsLogged: 0, exercisesCreated: 0, preferencesSet: 0 }),
    ).toEqual(['Rien n’a été appliqué.'])
  })
})

describe('planLines', () => {
  it('noms, cibles, charge, nouvel exercice, groupes', () => {
    const lines = planLines(
      {
        durationMin: 30,
        unknownExerciseIds: [],
        blocks: [
          { exerciseId: 'goblet-squat', sets: 3, reps: [8, 12], loadKg: 20, restSec: 90 },
          {
            exerciseId: 'Hip thrust',
            newExerciseIndex: 1,
            sets: 3,
            reps: [10, 10],
            restSec: 60,
            kind: 'superset',
            group: 2,
          },
          { exerciseId: 'plank', sets: 2, durationSec: 30, restSec: 45 },
        ],
      },
      (id) => (id === 'goblet-squat' ? 'Goblet squat' : id),
      (i) => (i === 1 ? 'Hip thrust au sol' : undefined),
    )
    expect(lines[0]).toEqual({ name: 'Goblet squat', isNew: false, text: '3 × 8 à 12 reps · 20 kg' })
    expect(lines[1]).toEqual({
      name: 'Hip thrust au sol',
      isNew: true,
      text: '3 × 10 reps',
      group: 'Superset',
    })
    expect(lines[2]?.text).toBe('2 × 30 s')
  })
})

describe('planLines : exercice créé décoché', () => {
  const plan = {
    durationMin: 30 as const,
    unknownExerciseIds: [],
    blocks: [
      {
        exerciseId: 'Hip thrust',
        newExerciseIndex: 1,
        sets: 3,
        reps: [10, 10] as [number, number],
        restSec: 60,
      },
    ],
  }
  it('marque la ligne écartée seulement si l’exercice n’est pas coché', () => {
    expect(
      planLines(
        plan,
        (id) => id,
        () => 'Hip thrust',
        new Set([1]),
      )[0]?.dropped,
    ).toBeUndefined()
    expect(
      planLines(
        plan,
        (id) => id,
        () => 'Hip thrust',
        new Set([0]),
      )[0]?.dropped,
    ).toBe(true)
    expect(
      planLines(
        plan,
        (id) => id,
        () => 'Hip thrust',
      )[0]?.dropped,
    ).toBeUndefined()
  })
})
