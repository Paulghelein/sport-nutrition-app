import { describe, expect, it } from 'vitest'
import type { Recipe, ShoppingItem } from '../../types/nutrition'
import {
  AISLE_LABELS,
  AISLE_ORDER,
  buildShoppingItems,
  groupShoppingItems,
  manualShoppingItem,
  shoppingKey,
} from './shopping'

const recipe = (id: string, servings: number, ingredients: Recipe['ingredients']): Recipe => ({
  id,
  name: id,
  meal: ['lunch'],
  servings,
  prepMinutes: 1,
  cookMinutes: 1,
  tags: [],
  ingredients,
  steps: [],
  source: 'seed',
  updatedAt: '2026-10-15T10:00:00.000Z',
})

const counter = (): (() => string) => {
  let n = 0
  return () => `id${++n}`
}

describe('shoppingKey', () => {
  it('food > ciqual > nom normalisé', () => {
    expect(shoppingKey({ name: 'X', foodId: 'ciqual-9', ciqualCode: '9' })).toBe('ciqual:9')
    expect(shoppingKey({ name: 'X', foodId: 'ciqual-9' })).toBe('ciqual:9')
    expect(shoppingKey({ name: 'X', foodId: 'uuid-1' })).toBe('food:uuid-1')
    expect(shoppingKey({ name: 'X', ciqualCode: '9' })).toBe('ciqual:9')
    expect(shoppingKey({ name: 'Crème Fraîche' })).toBe('name:creme fraiche')
  })
})

describe('buildShoppingItems', () => {
  const r1 = recipe('r1', 2, [
    { name: 'Riz', grams: 200, aisle: 'grocery', ciqualCode: '9' },
    { name: 'Oignon', grams: 100, aisle: 'produce' },
  ])
  const r2 = recipe('r2', 1, [
    { name: 'Riz basmati', grams: 75, aisle: 'other', ciqualCode: '9' },
    { name: 'oignon', grams: 50.4, aisle: 'other' },
  ])
  it('mise à l’échelle et fusion par clé', () => {
    const items = buildShoppingItems(
      [
        { recipe: r1, portions: 1 },
        { recipe: r2, portions: 2 },
      ],
      undefined,
      counter(),
    )
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      key: 'ciqual:9',
      name: 'Riz',
      grams: 250,
      aisle: 'grocery',
      checked: false,
    })
    expect(items[1]).toMatchObject({ key: 'name:oignon', name: 'Oignon', grams: 151, aisle: 'produce' })
  })
  it('conserve checked et id, garde les manuels, retire les clés disparues', () => {
    const prev: ShoppingItem[] = [
      { id: 'old-riz', key: 'ciqual:9', name: 'Riz', grams: 1, aisle: 'grocery', checked: true },
      { id: 'old-x', key: 'name:x', name: 'X', grams: 1, aisle: 'other', checked: true },
      manualShoppingItem('Piles', 'other', 0, 'm1'),
    ]
    const items = buildShoppingItems([{ recipe: r1, portions: 2 }], prev, counter())
    expect(items.find((i) => i.key === 'ciqual:9')).toMatchObject({
      id: 'old-riz',
      checked: true,
      grams: 200,
    })
    expect(items.find((i) => i.key === 'name:oignon')).toMatchObject({ id: 'id1', checked: false })
    expect(items.some((i) => i.key === 'name:x')).toBe(false)
    expect(items.at(-1)).toEqual(prev[2])
  })
})

describe('fusion seed + importée', () => {
  it('même aliment Ciqual = une seule ligne', () => {
    const seed = recipe('s', 1, [
      { name: 'Riz', grams: 100, aisle: 'grocery', foodId: 'ciqual-9119', ciqualCode: '9119' },
    ])
    const imported = recipe('i', 1, [
      { name: 'Riz basmati', grams: 50, aisle: 'grocery', ciqualCode: '9119' },
    ])
    const idOnly = recipe('o', 1, [{ name: 'Riz', grams: 25, aisle: 'grocery', foodId: 'ciqual-9119' }])
    const items = buildShoppingItems(
      [
        { recipe: seed, portions: 1 },
        { recipe: imported, portions: 1 },
        { recipe: idOnly, portions: 1 },
      ],
      undefined,
      counter(),
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ key: 'ciqual:9119', grams: 175 })
  })
})

describe('groupShoppingItems', () => {
  const mk = (name: string, aisle: ShoppingItem['aisle'], checked = false): ShoppingItem => ({
    id: name,
    key: `name:${name}`,
    name,
    grams: 10,
    aisle,
    checked,
  })
  it('ordre des rayons, vides omis, tri fr, cochés en fin', () => {
    const g = groupShoppingItems([
      mk('Riz', 'grocery'),
      mk('Pomme', 'produce'),
      mk('Ail', 'produce', true),
      mk('Épinards', 'produce'),
      mk('Carotte', 'produce'),
    ])
    expect(g.map((x) => x.aisle)).toEqual(['produce', 'grocery'])
    expect(g[0]?.items.map((i) => i.name)).toEqual(['Carotte', 'Épinards', 'Pomme', 'Ail'])
  })
  it('constantes cohérentes', () => {
    expect(AISLE_ORDER).toHaveLength(8)
    expect(Object.keys(AISLE_LABELS).sort()).toEqual([...AISLE_ORDER].sort())
  })
})

describe('manualShoppingItem', () => {
  it('article manuel', () => {
    expect(manualShoppingItem(' Sel ', 'grocery', 500, 'u')).toEqual({
      id: 'u',
      key: 'manual:u',
      name: 'Sel',
      grams: 500,
      aisle: 'grocery',
      checked: false,
      manual: true,
    })
  })
})
