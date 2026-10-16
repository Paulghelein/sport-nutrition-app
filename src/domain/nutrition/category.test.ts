import { describe, expect, it } from 'vitest'
import type { CiqualDataset, Food, FoodLogEntry, FoodLogOrigin } from '../../types/nutrition'
import type { FoodCategory } from '../../types/visuals'
import { entryVisual, foodCategory, isScannedFood } from './category'
import { ciqualDatasetToFoods } from './ciqual'
import real from '../../content/foods/ciqual.json'

const VALID: FoodCategory[] = [
  'meat',
  'fish',
  'egg',
  'dairy',
  'cheese',
  'starch',
  'bread',
  'vegetable',
  'fruit',
  'fat',
  'drink',
  'dish',
  'sweet',
]

describe('foodCategory (groupe Ciqual + nom)', () => {
  const cases: [string, string, FoodCategory][] = [
    ['Poulet, blanc, rôti', 'Viandes, oeufs, poissons', 'meat'],
    ['Oeuf, dur', 'Viandes, oeufs, poissons', 'egg'],
    ['Thon albacore, cru', 'Viandes, oeufs, poissons', 'fish'],
    ['Saumon, cuit', 'Viandes, oeufs, poissons', 'fish'],
    ['Crevette, cuite', 'Viandes, oeufs, poissons', 'fish'],
    ['Banane, pulpe, crue', 'Fruits, légumes, légumineuses et oléagineux', 'fruit'],
    ['Pomme de terre, bouillie', 'Fruits, légumes, légumineuses et oléagineux', 'starch'],
    ['Lentille verte, cuite', 'Fruits, légumes, légumineuses et oléagineux', 'starch'],
    ['Haricot vert, cuit', 'Fruits, légumes, légumineuses et oléagineux', 'vegetable'],
    ['Carotte, crue', 'Fruits, légumes, légumineuses et oléagineux', 'vegetable'],
    ['Amande, sans peau', 'Fruits, légumes, légumineuses et oléagineux', 'fat'],
    ['Riz blanc, cuit', 'Produits céréaliers', 'starch'],
    ['Pâtes alimentaires, cuites', 'Produits céréaliers', 'starch'],
    ["Flocons d'avoine", 'Produits céréaliers', 'starch'],
    ['Pain complet', 'Produits céréaliers', 'bread'],
    ['Baguette', 'Produits céréaliers', 'bread'],
    ['Lait demi-écrémé', 'Produits laitiers', 'dairy'],
    ['Fromage blanc nature', 'Produits laitiers', 'dairy'],
    ['Yaourt nature', 'Produits laitiers', 'dairy'],
    ['Lait de chèvre, entier', 'Produits laitiers', 'dairy'],
    ['Pomme de terre noisette', 'Fruits, légumes, légumineuses et oléagineux', 'starch'],
    ['Emmental', 'Produits laitiers', 'cheese'],
    ['Eau minérale', 'Eaux et autres boissons', 'drink'],
    ['Chocolat noir', 'Produits sucrés', 'sweet'],
    ['Glace vanille', 'Glaces et sorbets', 'sweet'],
    ["Huile d'olive", 'Matières grasses', 'fat'],
    ['Beurre de cacahuète', 'Matières grasses', 'fat'],
    ['Pizza au thon', 'Entrées et plats composés', 'dish'],
  ]
  it.each(cases)('%s (%s) -> %s', (name, ciqualGroup, expected) => {
    expect(foodCategory({ name, ciqualGroup })).toBe(expected)
  })

  const noGroup: [string, FoodCategory][] = [
    ['Whey protéine en poudre', 'dairy'],
    ['Skyr nature', 'dairy'],
    ['Yaourt grec', 'dairy'],
    ['Fromage blanc 0%', 'dairy'],
    ['Mozzarella', 'cheese'],
    ['Beurre de cacahuète', 'fat'],
    ["Huile d'olive", 'fat'],
    ['Pomme de terre', 'starch'],
    ['Pomme', 'fruit'],
    ['Riz basmati', 'starch'],
    ['Pâtes', 'starch'],
    ['Pâté de campagne', 'meat'],
    ["Flocons d'avoine", 'starch'],
    ['Thon en boîte', 'fish'],
    ['Oeufs', 'egg'],
    ['Œuf au plat', 'egg'],
    ['Blanc de poulet', 'meat'],
    ['Pain complet', 'bread'],
    ["Jus d'orange", 'drink'],
    ['Pizza margherita', 'dish'],
    ["Quelque chose d'inconnu", 'dish'],
    ['', 'dish'],
  ]
  it.each(noGroup)('sans groupe : %s -> %s', (name, expected) => {
    expect(foodCategory({ name })).toBe(expected)
  })

  it('groupe fourre-tout : mots-clés du nom, sinon dish', () => {
    expect(foodCategory({ name: 'Sel fin', ciqualGroup: 'Aides culinaires et ingrédients divers' })).toBe(
      'dish',
    )
    expect(foodCategory({ name: 'Lait infantile 2e âge', ciqualGroup: 'Aliments infantiles' })).toBe('dairy')
  })
})

describe('foodCategory sur tout le jeu Ciqual', () => {
  const foods = ciqualDatasetToFoods(real as CiqualDataset)
  it('chaque aliment reçoit une catégorie valide', () => {
    expect(foods.length).toBeGreaterThan(1000)
    for (const f of foods) expect(VALID).toContain(foodCategory({ name: f.name, ciqualGroup: f.group }))
  })
  it('aliments courants de prise de masse', () => {
    const find = (re: RegExp) => foods.find((f) => re.test(f.name))
    const expectations: [RegExp, FoodCategory][] = [
      [/^Riz blanc, cuit/, 'starch'],
      [/^Pâtes sèches, standard, cuites/, 'starch'],
      [/^Poulet, filet/, 'meat'],
      [/^Oeuf dur/, 'egg'],
      [/^Pomme de terre, bouillie/, 'starch'],
      [/^Banane, chair sans peau, crue/, 'fruit'],
      [/^Huile d'olive/, 'fat'],
      [/^Thon/, 'fish'],
    ]
    for (const [re, cat] of expectations) {
      const f = find(re)
      expect(f, String(re)).toBeDefined()
      if (f) expect(foodCategory({ name: f.name, ciqualGroup: f.group }), f.name).toBe(cat)
    }
  })
})

describe('entryVisual', () => {
  const entry = (origin: FoodLogOrigin, name = 'Entrée'): FoodLogEntry => ({
    id: 'e1',
    date: '2026-10-15',
    slot: 'lunch',
    name,
    origin,
    macros: { kcal: 100, protein: 1, carbs: 1, fat: 1 },
    createdAt: '2026-10-15T10:00:00.000Z',
  })
  const food = (extra: Partial<Food> = {}): Food => ({
    id: 'f1',
    name: 'Skyr nature',
    source: 'user',
    per100g: { kcal: 60, protein: 11, carbs: 4, fat: 0.2 },
    favorite: false,
    updatedAt: '2026-10-15T10:00:00.000Z',
    ...extra,
  })

  it('recette : dish, frigo selon fridgeItemId', () => {
    expect(entryVisual(entry({ kind: 'recipe', recipeId: 'r', portions: 1 }), {})).toEqual({
      category: 'dish',
      scanned: false,
      fromFridge: false,
    })
    expect(
      entryVisual(entry({ kind: 'recipe', recipeId: 'r', portions: 1, fridgeItemId: 'x' }), {}).fromFridge,
    ).toBe(true)
  })
  it('aliment scanné : badge et photo', () => {
    const v = entryVisual(entry({ kind: 'food', foodId: 'f1', grams: 150 }), {
      food: food({ ean: '123', source: 'off' }),
    })
    expect(v).toEqual({ category: 'dairy', photoFoodId: 'f1', scanned: true, fromFridge: false })
  })
  it('aliment non scanné : pas de photo', () => {
    const v = entryVisual(entry({ kind: 'food', foodId: 'f1', grams: 150 }), { food: food() })
    expect(v.scanned).toBe(false)
    expect(v.photoFoodId).toBeUndefined()
  })
  it("aliment supprimé : repli sur le nom de l'entrée et le groupe fourni", () => {
    const v = entryVisual(entry({ kind: 'food', foodId: 'gone', grams: 100 }, 'Riz blanc, cuit'), {
      ciqualGroup: 'Produits céréaliers',
    })
    expect(v.category).toBe('starch')
  })
  it('libre et import : catégorie sur le nom', () => {
    expect(entryVisual(entry({ kind: 'free' }, 'Pizza'), {}).category).toBe('dish')
    expect(entryVisual(entry({ kind: 'import', estimated: true }, 'Saumon grillé'), {}).category).toBe('fish')
  })
})

describe('isScannedFood', () => {
  it('code-barres ou source Open Food Facts = produit scanné', () => {
    expect(isScannedFood({ ean: '123', source: 'user' })).toBe(true)
    expect(isScannedFood({ source: 'off' })).toBe(true)
    expect(isScannedFood({ source: 'ciqual' })).toBe(false)
  })
})
