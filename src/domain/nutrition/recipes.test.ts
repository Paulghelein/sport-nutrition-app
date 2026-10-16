import { describe, expect, it } from 'vitest'
import ciqualJson from '../../content/foods/ciqual.json'
import { SEED_RECIPES } from '../../content/recipes'
import type { CiqualDataset, Food, FridgeItem, Recipe } from '../../types/nutrition'
import type { LibraryRecipe } from '../../types/recipes'
import { ciqualDatasetToFoods, ciqualToFood } from './ciqual'
import {
  DEFAULT_FRIDGE_DAYS,
  deletedSeedRecipes,
  emptyRecipeInput,
  filterRecipes,
  fridgeItemFromPrep,
  fridgeViews,
  mergeRecipes,
  recipeContentEquals,
  recipeListItems,
  recipeLogEntry,
  recipeNutrition,
  scaleIngredients,
  sortRecipes,
  toRecipeInput,
} from './recipes'

const T = '2026-10-15T10:00:00.000Z'

function recipe(over: Partial<Recipe> & { id: string }): Recipe {
  return {
    name: over.id,
    meal: ['lunch'],
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 20,
    tags: [],
    ingredients: [
      { name: 'Riz', grams: 200, aisle: 'grocery', per100g: { kcal: 350, protein: 7, carbs: 78, fat: 1 } },
    ],
    steps: ['Cuire.'],
    source: 'seed',
    updatedAt: T,
    ...over,
  }
}

const food = (id: string, kcal: number, protein = 10): Food => ({
  id,
  name: id,
  source: 'user',
  per100g: { kcal, protein, carbs: 0, fat: 0 },
  favorite: false,
  updatedAt: T,
})

describe('mergeRecipes', () => {
  const a = recipe({ id: 'a', name: 'Alpha' })
  const b = recipe({ id: 'b', name: 'Bravo' })
  it('seeds seuls, triés, non surchargés', () => {
    const r = mergeRecipes([b, a], [])
    expect(r.map((x) => x.id)).toEqual(['a', 'b'])
    expect(r.every((x) => !x.overridden)).toBe(true)
  })
  it('la surcharge seed gagne et est marquée', () => {
    const r = mergeRecipes([a, b], [{ ...a, name: 'Zèbre' }])
    expect(r.find((x) => x.id === 'a')).toMatchObject({ name: 'Zèbre', overridden: true })
  })
  it('deleted masque ; user deleted exclue ; orpheline ignorée', () => {
    const rows = [
      { ...a, deleted: true },
      recipe({ id: 'u1', source: 'user', deleted: true }),
      recipe({ id: 'u2', source: 'user' }),
      recipe({ id: 'ghost', source: 'seed' }),
    ]
    expect(mergeRecipes([a, b], rows).map((x) => x.id)).toEqual(['b', 'u2'])
    expect(deletedSeedRecipes([a, b], rows).map((x) => x.id)).toEqual(['a'])
  })
  it('tri fr insensible aux accents', () => {
    expect(
      sortRecipes([recipe({ id: '1', name: 'Zaza' }), recipe({ id: '2', name: 'Éclair' })]).map((r) => r.id),
    ).toEqual(['2', '1'])
  })
})

describe('recipeNutrition', () => {
  const lookup = (id: string): Food | undefined =>
    ({ f1: food('f1', 100), 'ciqual-9': food('ciqual-9', 200) })[id]
  it('priorité food > ciqual > per100g > missing', () => {
    const r = recipe({
      id: 'n',
      servings: 2,
      ingredients: [
        {
          name: 'A',
          grams: 100,
          aisle: 'other',
          foodId: 'f1',
          ciqualCode: '9',
          per100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 },
        },
        { name: 'B', grams: 100, aisle: 'other', foodId: 'inconnu', ciqualCode: '9' },
        { name: 'C', grams: 100, aisle: 'other', per100g: { kcal: 50, protein: 0, carbs: 0, fat: 0 } },
        { name: 'D', grams: 100, aisle: 'other' },
      ],
    })
    const n = recipeNutrition(r, lookup)
    expect(n.ingredients.map((i) => i.resolution)).toEqual(['food', 'ciqual', 'per100g', 'missing'])
    expect(n.total.kcal).toBe(350)
    expect(n.perServing.kcal).toBe(175)
    expect(n.missing).toEqual(['D'])
  })
})

describe('filtres', () => {
  const r1 = recipe({
    id: 'r1',
    name: 'Crème brûlée',
    meal: ['snack'],
    prepMinutes: 5,
    cookMinutes: 5,
    favorite: true,
  })
  const r2 = recipe({
    id: 'r2',
    name: 'Poulet rôti',
    meal: ['dinner'],
    prepMinutes: 20,
    cookMinutes: 40,
    ingredients: [
      {
        name: 'Poulet',
        grams: 400,
        aisle: 'butcher',
        per100g: { kcal: 200, protein: 25, carbs: 0, fat: 10 },
      },
    ],
  })
  const items = recipeListItems(mergeRecipes([r1, r2], []), () => undefined)
  const ids = (f: Parameters<typeof filterRecipes>[1]): string[] =>
    filterRecipes(items, f).map((i) => i.recipe.id)
  it('totalMinutes et protéines par portion', () => {
    expect(items.find((i) => i.recipe.id === 'r2')).toMatchObject({ totalMinutes: 60 })
    expect(items.find((i) => i.recipe.id === 'r2')?.perServing.protein).toBe(50)
  })
  it('nom et ingrédient sans accents', () => {
    expect(ids({ query: 'creme brulee' })).toEqual(['r1'])
    expect(ids({ ingredient: 'POULET' })).toEqual(['r2'])
  })
  it('meal, temps, protéines, favoris', () => {
    expect(ids({ meal: 'dinner' })).toEqual(['r2'])
    expect(ids({ maxTotalMinutes: 10 })).toEqual(['r1'])
    expect(ids({ minProteinPerServing: 20 })).toEqual(['r2'])
    expect(ids({ favoritesOnly: true })).toEqual(['r1'])
    expect(ids({})).toHaveLength(2)
  })
})

describe('scaleIngredients', () => {
  it('proportionnel, arrondi, minimum 1 g', () => {
    const r = recipe({
      id: 's',
      servings: 4,
      ingredients: [
        { name: 'Riz', grams: 250, aisle: 'grocery' },
        { name: 'Sel', grams: 1, aisle: 'grocery' },
        { name: 'Zéro', grams: 0, aisle: 'grocery' },
      ],
    })
    expect(scaleIngredients(r, 2).map((i) => i.grams)).toEqual([125, 1, 0])
    expect(scaleIngredients(r, 1).map((i) => i.grams)).toEqual([63, 1, 0])
  })
})

describe('recipeLogEntry', () => {
  const r = recipe({ id: 'rx', name: 'Chili', servings: 2 })
  const n = recipeNutrition(r, () => undefined)
  const base = { recipeId: 'rx', date: '2026-10-16', slot: 'dinner' as const }
  it('macros figées perServing × portions, nom FR', () => {
    const e = recipeLogEntry(r, n, { ...base, portions: 1.5 }, { id: 'e1', createdAt: T })
    expect(e.macros.kcal).toBeCloseTo(n.perServing.kcal * 1.5)
    expect(e.name).toBe('Chili (×1,5)')
    expect(e.origin).toEqual({ kind: 'recipe', recipeId: 'rx', portions: 1.5 })
    expect('fridgeItemId' in e.origin).toBe(false)
  })
  it('1 portion : nom brut ; fridgeItemId conservé', () => {
    const e = recipeLogEntry(r, n, { ...base, portions: 1, fridgeItemId: 'f1' }, { id: 'e1', createdAt: T })
    expect(e.name).toBe('Chili')
    expect(e.origin).toEqual({ kind: 'recipe', recipeId: 'rx', portions: 1, fridgeItemId: 'f1' })
  })
})

describe('recipeLogEntry : nom long', () => {
  it('tronque le nom de base pour tenir en 120 caractères', () => {
    const r = recipe({ id: 'long', name: 'A'.repeat(200) })
    const n = recipeNutrition(r, () => undefined)
    const e = recipeLogEntry(
      r,
      n,
      { recipeId: 'long', portions: 1.5, date: '2026-10-16', slot: 'lunch' },
      { id: 'e', createdAt: T },
    )
    expect(e.name.length).toBeLessThanOrEqual(120)
    expect(e.name.endsWith('…  (×1,5)'.replace('  ', ' '))).toBe(true)
    const one = recipeLogEntry(
      r,
      n,
      { recipeId: 'long', portions: 1, date: '2026-10-16', slot: 'lunch' },
      { id: 'e', createdAt: T },
    )
    expect(one.name.length).toBe(120)
  })
})

describe('frigo', () => {
  const r = recipe({ id: 'r', fridgeDays: 4 }) as LibraryRecipe
  it('péremption par défaut ou de la recette', () => {
    expect(
      fridgeItemFromPrep({ recipeId: 'r', portions: 4, preparedOn: '2026-10-15' }, r, 'x').expiresOn,
    ).toBe('2026-10-19')
    const { fridgeDays: _f, ...noDays } = r
    void _f
    expect(fridgeItemFromPrep({ recipeId: 'r', portions: 4, preparedOn: '2026-10-15' }, noDays, 'x')).toEqual(
      {
        id: 'x',
        recipeId: 'r',
        portionsLeft: 4,
        preparedOn: '2026-10-15',
        expiresOn: `2026-10-${15 + DEFAULT_FRIDGE_DAYS}`,
      },
    )
  })
  it('vues triées, jours restants, recette absente', () => {
    const items: FridgeItem[] = [
      { id: '1', recipeId: 'r', portionsLeft: 2, preparedOn: '2026-10-10', expiresOn: '2026-10-20' },
      { id: '2', recipeId: 'gone', portionsLeft: 1, preparedOn: '2026-10-10', expiresOn: '2026-10-15' },
    ]
    const v = fridgeViews(items, [r], '2026-10-16')
    expect(v.map((x) => x.item.id)).toEqual(['2', '1'])
    expect(v[0]).toMatchObject({ daysLeft: -1, expired: true })
    expect(v[0]?.recipe).toBeUndefined()
    expect(v[1]).toMatchObject({ daysLeft: 4, expired: false })
  })
})

describe('formulaire', () => {
  it('toRecipeInput / égalité', () => {
    const r = recipe({ id: 'z', favorite: true, fridgeDays: 2 })
    const input = toRecipeInput(r)
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('favorite')
    expect(recipeContentEquals(input, toRecipeInput({ ...r, favorite: false, updatedAt: 'x' }))).toBe(true)
    expect(recipeContentEquals(input, { ...input, steps: ['Autre'] })).toBe(false)
    expect(emptyRecipeInput().servings).toBe(1)
  })
})

describe('recettes de départ', () => {
  const foods = ciqualDatasetToFoods(ciqualJson as CiqualDataset).map((c) => ciqualToFood(c, T))
  const byId = new Map(foods.map((f) => [f.id, f]))
  const lookup = (id: string): Food | undefined => byId.get(id)

  it('macros plausibles, aucun ingrédient sans données', () => {
    expect(SEED_RECIPES.length).toBeGreaterThan(0)
    const problems: string[] = []
    for (const r of SEED_RECIPES) {
      const n = recipeNutrition(r, lookup)
      if (n.missing.length > 0) problems.push(`${r.id}: manque ${n.missing.join(', ')}`)
      const m = n.perServing
      if (!(m.kcal > 0 && m.protein > 0 && m.carbs >= 0 && m.fat >= 0))
        problems.push(`${r.id}: macros nulles`)
      if (!r.meal.includes('snack') && r.meal.some((s) => s !== 'breakfast') && m.protein < 5)
        problems.push(`${r.id}: ${m.protein.toFixed(1)} g de protéines`)
    }
    expect(problems).toEqual([])
  })
})

describe('servingUnit', () => {
  it('toRecipeInput le recopie et recipeContentEquals le voit changer', () => {
    const base = { ...(SEED_RECIPES[0] as Recipe), servingUnit: 'muffins' }
    const a = toRecipeInput(base)
    expect(a.servingUnit).toBe('muffins')
    expect(recipeContentEquals(a, toRecipeInput({ ...base, servingUnit: 'boîtes' }))).toBe(false)
    expect(recipeContentEquals(a, toRecipeInput(base))).toBe(true)
    expect('servingUnit' in toRecipeInput({ ...base, servingUnit: undefined })).toBe(false)
  })
})
