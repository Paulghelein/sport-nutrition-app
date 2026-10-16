import { describe, expect, it } from 'vitest'
import type { CiqualFood, Food } from '../../types/nutrition'
import type { ScanRecipeDraft } from '../../types/recipes'
import { validateRecipeInput } from '../../db/validation'
import { recipeNutrition } from './recipes'
import {
  checkScanDraft,
  draftToRecipeInput,
  SCAN_DEFAULT_STEP,
  scanIngredientFromCiqual,
  scanIngredientFromFood,
  servingLabel,
  setIngredientGrams,
  withWholePackage,
} from './scan'

const off: Food = {
  id: 'off-1',
  name: 'Farine',
  source: 'off',
  ean: '1',
  per100g: { kcal: 350, protein: 10, carbs: 70, fat: 1 },
  packageG: 1000,
  defaultPortionG: 30,
  favorite: false,
  updatedAt: '2026-01-01T00:00:00Z',
}
const ciqual: CiqualFood = {
  id: 'ciqual-1',
  code: '1',
  name: 'Oeuf',
  group: 'g',
  search: 'oeuf',
  per100g: { kcal: 140, protein: 12, carbs: 0, fat: 10 },
}

describe('ingrédients', () => {
  it('quantité par défaut : paquet, puis portion, puis 100 g', () => {
    const a = scanIngredientFromFood(off, { key: 'a' })
    expect(a).toMatchObject({ grams: 1000, wholePackage: true, origin: 'scan', foodId: 'off-1', packageG: 1000, aisle: 'other' })
    const b = scanIngredientFromFood({ ...off, packageG: undefined }, { key: 'b' })
    expect(b.grams).toBe(30)
    expect(b.wholePackage).toBeUndefined()
    const c = scanIngredientFromFood({ ...off, packageG: undefined, defaultPortionG: undefined }, { key: 'c' })
    expect(c.grams).toBe(100)
  })
  it('aliment perso sans EAN : origin food ; grams imposés', () => {
    const f = scanIngredientFromFood({ ...off, source: 'user', ean: undefined, packageG: undefined, aisle: 'dairy' }, { key: 'k', grams: 50 })
    expect(f).toMatchObject({ origin: 'food', grams: 50, aisle: 'dairy' })
  })
  it('Ciqual', () => {
    expect(scanIngredientFromCiqual(ciqual, { key: 'x' })).toEqual({
      key: 'x', name: 'Oeuf', grams: 100, origin: 'ciqual', ciqualCode: '1', aisle: 'other',
    })
    expect(scanIngredientFromCiqual(ciqual, { key: 'x', grams: 60, aisle: 'dairy' })).toMatchObject({ grams: 60, aisle: 'dairy' })
  })
  it('wholePackage suit la quantité', () => {
    const a = scanIngredientFromFood(off, { key: 'a' })
    const b = setIngredientGrams(a, 250)
    expect(b.grams).toBe(250)
    expect(b.wholePackage).toBeUndefined()
    expect(a.wholePackage).toBe(true)
    expect(withWholePackage(b)).toMatchObject({ grams: 1000, wholePackage: true })
    const c = scanIngredientFromCiqual(ciqual, { key: 'c' })
    expect(withWholePackage(c)).toBe(c)
  })
})

const draft = (over: Partial<ScanRecipeDraft> = {}): ScanRecipeDraft => ({
  name: '  Muffins  ',
  servings: 6,
  servingUnit: ' muffins ',
  meal: [],
  ingredients: [
    scanIngredientFromFood(off, { key: 'a', grams: 300 }),
    scanIngredientFromCiqual(ciqual, { key: 'b', grams: 100 }),
  ],
  ...over,
})

describe('draftToRecipeInput', () => {
  it('convertit et réutilise recipeNutrition', () => {
    const input = draftToRecipeInput(draft())
    expect(input).toMatchObject({
      name: 'Muffins', meal: ['lunch'], servings: 6, servingUnit: 'muffins', prepMinutes: 0, cookMinutes: 0, tags: [], steps: [SCAN_DEFAULT_STEP],
    })
    expect(input.ingredients[0]).toEqual({ name: 'Farine', grams: 300, aisle: 'other', foodId: 'off-1' })
    expect(input.ingredients[1]).toEqual({ name: 'Oeuf', grams: 100, aisle: 'other', ciqualCode: '1' })
    const lookup = (id: string): Food | undefined => (id === 'off-1' ? off : undefined)
    const ciq = (id: string): Food | undefined =>
      id === 'ciqual-1' ? { ...off, id, per100g: ciqual.per100g } : lookup(id)
    const n = recipeNutrition({ ...input, id: 'r', source: 'user', updatedAt: '' }, ciq)
    expect(n.total.kcal).toBeCloseTo(300 * 3.5 + 140)
    expect(n.perServing.kcal).toBeCloseTo((300 * 3.5 + 140) / 6)
    expect(n.missing).toEqual([])
  })
  it('unité vide ou « portions » omise ; repas conservés', () => {
    expect('servingUnit' in draftToRecipeInput(draft({ servingUnit: '  ' }))).toBe(false)
    expect('servingUnit' in draftToRecipeInput(draft({ servingUnit: 'Portions' }))).toBe(false)
    expect(draftToRecipeInput(draft({ meal: ['snack'] })).meal).toEqual(['snack'])
  })
})

describe('checkScanDraft', () => {
  it('valide', () => expect(checkScanDraft(draft())).toBeNull())
  it('refuse nom, ingrédients, portions, grammes, unité', () => {
    expect(checkScanDraft(draft({ name: ' ' }))).toMatch(/nom/)
    expect(checkScanDraft(draft({ ingredients: [] }))).toMatch(/ingrédient/)
    for (const s of [0, 1.5, 51, NaN]) expect(checkScanDraft(draft({ servings: s }))).toMatch(/portions/)
    const zero = scanIngredientFromFood(off, { key: 'z', grams: 0 })
    expect(checkScanDraft(draft({ ingredients: [zero] }))).toMatch(/Farine/)
    expect(checkScanDraft(draft({ name: 'x'.repeat(121) }))).toMatch(/120/)
    expect(checkScanDraft(draft({ name: 'x'.repeat(120) }))).toBeNull()
    const huge = scanIngredientFromFood(off, { key: 'h', grams: 10001 })
    expect(checkScanDraft(draft({ ingredients: [huge] }))).toMatch(/10000/)
    const orphan = { ...scanIngredientFromFood(off, { key: 'o' }), foodId: undefined }
    expect(checkScanDraft(draft({ ingredients: [orphan] }))).toMatch(/aucun aliment/)
    const orphanC = { ...scanIngredientFromCiqual(ciqual, { key: 'c' }), ciqualCode: undefined }
    expect(checkScanDraft(draft({ ingredients: [orphanC] }))).toMatch(/aucun aliment/)
    expect(checkScanDraft(draft({ servingUnit: 'x'.repeat(25) }))).toMatch(/unité/)
    expect(checkScanDraft(draft({ servingUnit: 'x'.repeat(24) }))).toBeNull()
  })
})

describe('servingLabel', () => {
  it('unité libre ou portions', () => {
    expect(servingLabel(6, 'muffins')).toBe('6 muffins')
    expect(servingLabel(1)).toBe('1 portion')
    expect(servingLabel(3, '')).toBe('3 portions')
    expect(servingLabel(1, 'portions')).toBe('1 portion')
  })
})

describe('compatibilité avec src/db/validation', () => {
  it('draftToRecipeInput valide passe validateRecipeInput', () => {
    expect(validateRecipeInput(draftToRecipeInput(draft()))).toBeNull()
    expect(validateRecipeInput(draftToRecipeInput(draft({ servingUnit: '', meal: ['snack'] })))).toBeNull()
  })
  it('noms d\'ingrédients vides : repli non vide', () => {
    const a = { ...scanIngredientFromFood(off, { key: 'a' }), name: '  ' }
    const b = { ...scanIngredientFromCiqual(ciqual, { key: 'b' }), name: '' }
    const c = { ...scanIngredientFromFood({ ...off, id: 'uuid-1', source: 'user', ean: undefined }, { key: 'c' }), name: '' }
    const input = draftToRecipeInput(draft({ ingredients: [a, b, c] }))
    expect(input.ingredients.map((i) => i.name)).toEqual(['Produit 1', 'Aliment Ciqual 1', 'Ingrédient'])
    expect(validateRecipeInput(input)).toBeNull()
  })
})
