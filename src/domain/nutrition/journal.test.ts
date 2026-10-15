import { describe, expect, it } from 'vitest'
import type { Food, FoodLogEntry, Macros } from '../../types/nutrition'
import {
  copyMeal,
  dayLog,
  favoriteItems,
  foodLogEntry,
  freeLogEntry,
  macrosFor,
  progressRatio,
  recentItems,
  regrams,
  roundMacros,
  sumMacros,
} from './journal'

const chicken: Food = {
  id: 'ciqual-36017',
  name: 'Poulet, filet sans peau cru',
  source: 'ciqual',
  per100g: { kcal: 110, protein: 23.4, carbs: 0, fat: 1.5 },
  favorite: false,
  updatedAt: '2026-10-15T10:00:00.000Z',
}
const rice: Food = {
  id: 'ciqual-9119',
  name: 'Riz thaï ou basmati, cru',
  source: 'ciqual',
  per100g: { kcal: 351, protein: 7.4, carbs: 78.4, fat: 0.6, fiber: 1.1 },
  favorite: true,
  defaultPortionG: 80,
  updatedAt: '2026-10-15T10:00:00.000Z',
}
const T = (n: number) => `2026-10-15T10:00:0${n}.000Z`

describe('macrosFor', () => {
  it('proportionnel, non arrondi', () => {
    const m = macrosFor(chicken.per100g, 150)
    expect(m.kcal).toBeCloseTo(165, 10)
    expect(m.protein).toBeCloseTo(35.1, 10)
    expect(m.carbs).toBe(0)
    expect(m.fat).toBeCloseTo(2.25, 10)
  })
  it('ne renvoie pas les fibres', () => {
    expect(Object.keys(macrosFor(rice.per100g, 100)).sort()).toEqual(['carbs', 'fat', 'kcal', 'protein'])
  })
  it('0 g -> 0', () => expect(macrosFor(rice.per100g, 0)).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 }))
})

describe('foodLogEntry / freeLogEntry', () => {
  it('macros figées, origine food', () => {
    const e = foodLogEntry(chicken, 200, 'lunch', '2026-10-15', { id: 'e1', now: T(0) })
    expect(e).toEqual({
      id: 'e1',
      date: '2026-10-15',
      slot: 'lunch',
      name: chicken.name,
      origin: { kind: 'food', foodId: chicken.id, grams: 200 },
      macros: { kcal: 220, protein: 46.8, carbs: 0, fat: 3 },
      createdAt: T(0),
    })
  })
  it("modifier l'aliment ensuite ne change pas l'entrée", () => {
    const f = { ...chicken, per100g: { ...chicken.per100g } }
    const e = foodLogEntry(f, 100, 'lunch', '2026-10-15', { id: 'e1', now: T(0) })
    f.per100g.kcal = 999
    expect(e.macros.kcal).toBe(110)
  })
  it('saisie libre : macros absentes -> 0', () => {
    const e = freeLogEntry({ name: '  Pizza ', kcal: 800 }, 'dinner', '2026-10-15', { id: 'e2', now: T(1) })
    expect(e.name).toBe('Pizza')
    expect(e.origin).toEqual({ kind: 'free' })
    expect(e.macros).toEqual({ kcal: 800, protein: 0, carbs: 0, fat: 0 })
    const f = freeLogEntry({ name: 'x', kcal: 100, protein: 5, carbs: 10, fat: 2 }, 'snack', '2026-10-15', {
      id: 'e3',
      now: T(1),
    })
    expect(f.macros).toEqual({ kcal: 100, protein: 5, carbs: 10, fat: 2 })
  })
})

describe('sumMacros', () => {
  it('somme, liste vide = zéro', () => {
    expect(sumMacros([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
    const a: Macros = { kcal: 1, protein: 2, carbs: 3, fat: 4 }
    expect(sumMacros([a, a])).toEqual({ kcal: 2, protein: 4, carbs: 6, fat: 8 })
  })
})

describe('dayLog', () => {
  const entries = [
    foodLogEntry(rice, 100, 'dinner', '2026-10-15', { id: 'b', now: T(2) }),
    foodLogEntry(chicken, 100, 'dinner', '2026-10-15', { id: 'a', now: T(1) }),
    freeLogEntry({ name: 'Café', kcal: 5 }, 'breakfast', '2026-10-15', { id: 'c', now: T(0) }),
    freeLogEntry({ name: 'Hier', kcal: 999 }, 'lunch', '2026-10-14', { id: 'd', now: T(0) }),
  ]
  it('4 repas toujours présents dans l’ordre', () => {
    const d = dayLog(entries, '2026-10-15')
    expect(d.meals.map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'dinner', 'snack'])
    expect(dayLog([], '2026-10-15').meals).toHaveLength(4)
    expect(dayLog([], '2026-10-15').totals.kcal).toBe(0)
  })
  it('entrées triées par createdAt, autre jour exclu, totaux', () => {
    const d = dayLog(entries, '2026-10-15')
    expect(d.meals[2]?.entries.map((e) => e.id)).toEqual(['a', 'b'])
    expect(d.meals[1]?.entries).toEqual([])
    expect(d.meals[2]?.totals.kcal).toBe(461)
    expect(d.totals.kcal).toBe(466)
  })
  it("ne mute pas l'entrée", () => {
    const copy = [...entries]
    dayLog(entries, '2026-10-15')
    expect(entries).toEqual(copy)
  })
})

describe('copyMeal', () => {
  const src: FoodLogEntry[] = [
    foodLogEntry(chicken, 100, 'dinner', '2026-10-14', { id: 'a', now: T(1) }),
    {
      id: 'r',
      date: '2026-10-14',
      slot: 'dinner',
      name: 'Chili',
      origin: { kind: 'recipe', recipeId: 'chili', portions: 1, fridgeItemId: 'f1' },
      macros: { kcal: 600, protein: 40, carbs: 60, fat: 20 },
      createdAt: T(2),
    },
    freeLogEntry({ name: 'Pizza', kcal: 800 }, 'dinner', '2026-10-14', { id: 'c', now: T(0) }),
  ]
  let n = 0
  const out = copyMeal(src, '2026-10-15', 'lunch', {
    newId: () => `n${++n}`,
    now: '2026-10-15T12:00:00.000Z',
  })
  it('nouveaux id, date, repas, createdAt croissants', () => {
    expect(out.map((e) => e.id)).toEqual(['n1', 'n2', 'n3'])
    expect(out.every((e) => e.date === '2026-10-15' && e.slot === 'lunch')).toBe(true)
    expect(out.map((e) => e.createdAt)).toEqual([
      '2026-10-15T12:00:00.000Z',
      '2026-10-15T12:00:00.001Z',
      '2026-10-15T12:00:00.002Z',
    ])
  })
  it("conserve l'ordre d'origine (createdAt), macros et origine; retire fridgeItemId", () => {
    expect(out.map((e) => e.name)).toEqual(['Pizza', chicken.name, 'Chili'])
    expect(out[1]?.macros).toEqual(src[0]?.macros)
    expect(out[1]?.origin).toEqual(src[0]?.origin)
    expect(out[2]?.origin).toEqual({ kind: 'recipe', recipeId: 'chili', portions: 1 })
  })
  it('la source est intacte', () => {
    expect(src[1]?.id).toBe('r')
    expect(src[1]?.origin).toEqual({ kind: 'recipe', recipeId: 'chili', portions: 1, fridgeItemId: 'f1' })
  })
  it('repas vide -> vide', () => {
    expect(copyMeal([], '2026-10-15', 'lunch', { newId: () => 'x', now: T(0) })).toEqual([])
  })
})

describe('recentItems', () => {
  const foodsById = new Map([chicken, rice].map((f) => [f.id, f]))
  const log: FoodLogEntry[] = [
    foodLogEntry(chicken, 100, 'lunch', '2026-10-13', { id: '1', now: '2026-10-13T12:00:00.000Z' }),
    foodLogEntry(rice, 80, 'lunch', '2026-10-13', { id: '2', now: '2026-10-13T12:01:00.000Z' }),
    freeLogEntry({ name: 'Pizza', kcal: 800 }, 'dinner', '2026-10-14', {
      id: '3',
      now: '2026-10-14T20:00:00.000Z',
    }),
    foodLogEntry(chicken, 180, 'dinner', '2026-10-14', { id: '4', now: '2026-10-14T20:05:00.000Z' }),
    {
      id: '5',
      date: '2026-10-15',
      slot: 'snack',
      name: 'pizza',
      origin: { kind: 'import', estimated: true },
      macros: { kcal: 700, protein: 30, carbs: 80, fat: 25 },
      createdAt: '2026-10-15T16:00:00.000Z',
    },
    {
      id: '6',
      date: '2026-10-15',
      slot: 'dinner',
      name: 'Chili',
      origin: { kind: 'recipe', recipeId: 'chili', portions: 1 },
      macros: { kcal: 600, protein: 40, carbs: 60, fat: 20 },
      createdAt: '2026-10-15T20:00:00.000Z',
    },
    foodLogEntry({ ...chicken, id: 'gone' }, 50, 'snack', '2026-10-15', {
      id: '7',
      now: '2026-10-15T21:00:00.000Z',
    }),
  ]
  const out = recentItems(log, foodsById, 10)
  it('plus récents d’abord, dédoublonnés, recettes et aliments disparus ignorés', () => {
    expect(out.map((i) => i.key)).toEqual(['free:pizza', 'food:ciqual-36017', 'food:ciqual-9119'])
  })
  it('aliment : dernière quantité ; libre : macros de la dernière', () => {
    expect(out[0]).toEqual({ kind: 'free', key: 'free:pizza', name: 'pizza', macros: log[4]?.macros })
    expect(out[1]).toMatchObject({ kind: 'food', grams: 180 })
    expect(out[2]).toMatchObject({ kind: 'food', grams: 80 })
  })
  it('limit', () => {
    expect(recentItems(log, foodsById, 2)).toHaveLength(2)
    expect(recentItems(log, foodsById, 0)).toEqual([])
  })
  it('journal vide', () => expect(recentItems([], foodsById, 5)).toEqual([]))
})

describe('favoriteItems', () => {
  it('favoris triés par nom, portion habituelle ou 100 g', () => {
    const fav2 = { ...chicken, favorite: true }
    const out = favoriteItems([fav2, rice, { ...rice, id: 'x', favorite: false }])
    expect(out.map((i) => i.key)).toEqual(['food:ciqual-36017', 'food:ciqual-9119'])
    expect(out[0]).toMatchObject({ grams: 100 })
    expect(out[1]).toMatchObject({ grams: 80 })
  })
})

describe('regrams', () => {
  const e = foodLogEntry(chicken, 100, 'lunch', '2026-10-15', { id: 'e', now: T(0) })
  it('met à l’échelle les macros figées', () => {
    const r = regrams(e, 250)
    expect(r.origin).toEqual({ kind: 'food', foodId: chicken.id, grams: 250 })
    expect(r.macros.kcal).toBeCloseTo(275, 10)
    expect(r.macros.protein).toBeCloseTo(58.5, 10)
    expect(r.id).toBe('e')
    expect(r.createdAt).toBe(e.createdAt)
    expect(e.macros.kcal).toBe(110) // entrée d'origine intacte
  })
  it('ne dépend pas de l’aliment actuel : macros figées d’une entrée dont l’aliment a changé', () => {
    const frozen = { ...e, macros: { kcal: 90, protein: 20, carbs: 0, fat: 1 } }
    expect(regrams(frozen, 50).macros).toEqual({ kcal: 45, protein: 10, carbs: 0, fat: 0.5 })
  })
  it('quantité invalide ou origine non aliment -> RangeError', () => {
    expect(() => regrams(e, 0)).toThrow(RangeError)
    expect(() => regrams(e, Number.NaN)).toThrow(RangeError)
    const free = freeLogEntry({ name: 'x', kcal: 1 }, 'snack', '2026-10-15', { id: 'f', now: T(0) })
    expect(() => regrams(free, 10)).toThrow(RangeError)
  })
})

describe('affichage', () => {
  it('roundMacros : kcal entier, macros au dixième', () => {
    expect(roundMacros({ kcal: 3046.68, protein: 135.04, carbs: 421.019, fat: 91.45 })).toEqual({
      kcal: 3047,
      protein: 135,
      carbs: 421,
      fat: 91.5,
    })
  })
  it('progressRatio : non plafonné, cible nulle -> 0', () => {
    expect(progressRatio(1500, 3000)).toBe(0.5)
    expect(progressRatio(3300, 3000)).toBeCloseTo(1.1, 10)
    expect(progressRatio(10, 0)).toBe(0)
    expect(progressRatio(0, 100)).toBe(0)
  })
})
