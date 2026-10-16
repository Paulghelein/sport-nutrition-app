import { describe, expect, it } from 'vitest'
import type { ScanIngredient } from '../../types'
import {
  EMPTY_STATE,
  STORAGE_KEY,
  effectiveFridge,
  findIngredient,
  ingredientSource,
  loadState,
  parseGrams,
  parseState,
  saveState,
  scanReducer,
  serializeState,
} from './draftState'
import type { RecipeScanState } from './draftState'

const lardons: ScanIngredient = {
  key: 'k1',
  name: 'Lardons',
  grams: 150,
  origin: 'scan',
  foodId: 'off-1',
  aisle: 'butcher',
  packageG: 150,
  wholePackage: true,
}
const oeufs: ScanIngredient = {
  key: 'k2',
  name: 'Œufs',
  grams: 100,
  origin: 'ciqual',
  ciqualCode: '22000',
  aisle: 'other',
}

const withBoth = (): RecipeScanState =>
  scanReducer(scanReducer(EMPTY_STATE, { type: 'add', ingredient: lardons }), {
    type: 'add',
    ingredient: oeufs,
  })

function memory(initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(STORAGE_KEY, initial)
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

describe('scanReducer', () => {
  it('ajoute dans l’ordre et refuse un doublon (même aliment ou même code Ciqual)', () => {
    const s = withBoth()
    expect(s.draft.ingredients.map((i) => i.key)).toEqual(['k1', 'k2'])
    expect(scanReducer(s, { type: 'add', ingredient: { ...lardons, key: 'autre' } })).toBe(s)
    expect(scanReducer(s, { type: 'add', ingredient: { ...oeufs, key: 'autre' } })).toBe(s)
    expect(findIngredient(s.draft, { foodId: 'off-1' })?.key).toBe('k1')
    expect(findIngredient(s.draft, { foodId: 'off-9' })).toBeUndefined()
  })

  it('modifie la quantité : le drapeau « paquet entier » suit', () => {
    const s = scanReducer(withBoth(), { type: 'set_grams', key: 'k1', grams: 80 })
    const edited = s.draft.ingredients[0]
    expect(edited?.grams).toBe(80)
    expect(edited?.wholePackage).toBeUndefined()
    expect(ingredientSource(edited as ScanIngredient)).toBe('scanné · 80 g sur 150 g')
    const back = scanReducer(s, { type: 'whole_package', key: 'k1' })
    expect(back.draft.ingredients[0]?.grams).toBe(150)
    expect(ingredientSource(back.draft.ingredients[0] as ScanIngredient)).toBe('scanné · paquet entier')
    // Sans contenance : « paquet entier » ne change rien.
    expect(scanReducer(s, { type: 'whole_package', key: 'k2' }).draft.ingredients[1]?.grams).toBe(100)
  })

  it('supprime un ingrédient', () => {
    expect(
      scanReducer(withBoth(), { type: 'remove', key: 'k1' }).draft.ingredients.map((i) => i.key),
    ).toEqual(['k2'])
  })

  it('borne les portions (1–50) et l’unité (24 car.)', () => {
    expect(scanReducer(EMPTY_STATE, { type: 'set_servings', servings: 0 }).draft.servings).toBe(1)
    expect(scanReducer(EMPTY_STATE, { type: 'set_servings', servings: 99 }).draft.servings).toBe(50)
    expect(
      scanReducer(EMPTY_STATE, { type: 'set_unit', unit: 'x'.repeat(40) }).draft.servingUnit,
    ).toHaveLength(24)
  })

  it('frigo : suit les portions tant qu’il n’est pas choisi, reste dans [0, portions]', () => {
    let s = scanReducer(EMPTY_STATE, { type: 'set_servings', servings: 6 })
    expect(effectiveFridge(s)).toBe(6)
    s = scanReducer(s, { type: 'set_fridge', fridge: 0 })
    expect(effectiveFridge(s)).toBe(0)
    s = scanReducer(scanReducer(s, { type: 'set_fridge', fridge: 5 }), { type: 'set_servings', servings: 3 })
    expect(effectiveFridge(s)).toBe(3)
  })

  it('tout effacer', () => {
    expect(scanReducer(withBoth(), { type: 'clear' })).toEqual(EMPTY_STATE)
  })
})

describe('parseGrams', () => {
  it('accepte virgule et suffixe g, refuse le reste et les bornes', () => {
    expect(parseGrams('80')).toBe(80)
    expect(parseGrams(' 37,5 g ')).toBe(37.5)
    expect(parseGrams('10000')).toBe(10000)
    for (const bad of ['', '0', '-5', 'abc', '10001', '1e3', '5,']) expect(parseGrams(bad), bad).toBeNull()
  })
})

describe('persistance du brouillon', () => {
  it('aller-retour fidèle', () => {
    let s = withBoth()
    s = scanReducer(s, { type: 'set_name', name: 'Egg muffins' })
    s = scanReducer(s, { type: 'set_servings', servings: 6 })
    s = scanReducer(s, { type: 'set_unit', unit: 'muffins' })
    s = scanReducer(s, { type: 'set_fridge', fridge: 4 })
    expect(parseState(serializeState(s))).toEqual(s)
    const store = memory()
    saveState(s, store)
    expect(loadState(store)).toEqual(s)
  })

  it('brouillon vide : la clé est effacée', () => {
    const store = memory(serializeState(withBoth()))
    saveState(EMPTY_STATE, store)
    expect(store.data.has(STORAGE_KEY)).toBe(false)
    expect(loadState(store)).toEqual(EMPTY_STATE)
  })

  it('lecture tolérante : JSON cassé, mauvaise version, mauvais types', () => {
    for (const raw of [null, '', '{', '[]', '"x"', '{"v":2,"draft":{}}', '{"v":1}', '{"v":1,"draft":[]}'])
      expect(parseState(raw), String(raw)).toBeNull()
    expect(loadState(memory('{'))).toEqual(EMPTY_STATE)
    expect(
      loadState({
        getItem: () => {
          throw new Error('stockage refusé')
        },
      }),
    ).toEqual(EMPTY_STATE)
  })

  it('valide à la relecture : ingrédient invalide écarté, nombres bornés', () => {
    const raw = JSON.stringify({
      v: 1,
      fridge: 999,
      draft: {
        name: 'Test',
        servings: 500,
        servingUnit: 3,
        meal: ['lunch', 'brunch'],
        ingredients: [
          lardons,
          { ...oeufs, key: 'k3', grams: -4 },
          { ...oeufs, key: 'k4', aisle: 'jardin' },
          { ...oeufs, key: 'k5', ciqualCode: undefined },
          { ...lardons, key: lardons.key },
          { ...oeufs, key: 'k6', wholePackage: true },
          'nimporte quoi',
        ],
      },
    })
    const s = parseState(raw)
    expect(s?.draft.ingredients.map((i) => i.key)).toEqual(['k1', 'k6'])
    expect(s?.draft.ingredients[1]?.wholePackage).toBeUndefined()
    expect(s?.draft.servings).toBe(50)
    expect(s?.draft.servingUnit).toBe('')
    expect(s?.draft.meal).toEqual(['lunch'])
    expect(s?.fridge).toBe(50)
  })

  it('écarte les clés ou identifiants vides ou trop longs, borne le nom', () => {
    const raw = JSON.stringify({
      v: 1,
      draft: {
        name: 'T',
        ingredients: [
          { ...lardons, key: '' },
          { ...lardons, key: 'k'.repeat(201) },
          { ...lardons, key: 'ok', foodId: 'f'.repeat(201) },
          { ...lardons, key: 'ok2', name: 'n'.repeat(500) },
        ],
      },
    })
    const s = parseState(raw)
    expect(s?.draft.ingredients.map((i) => i.key)).toEqual(['ok2'])
    expect(s?.draft.ingredients[0]?.name).toHaveLength(120)
  })

  it('un brouillon sans nom ni ingrédient n’est pas restauré', () => {
    expect(parseState(serializeState({ ...EMPTY_STATE, fridge: 3 }))).toBeNull()
  })
})
