import { describe, expect, it } from 'vitest'
import type { Food } from '../../types/nutrition'
import { ciqualDatasetToFoods, ciqualToFood } from './ciqual'
import { buildFoodIndex, normalizeFoodSearch, searchFoodIndex, searchFoods } from './search'
import real from '../../content/foods/ciqual.json'
import type { CiqualDataset } from '../../types/nutrition'

const food = (name: string, extra: Partial<Food> = {}): Food => ({
  id: name,
  name,
  source: 'ciqual',
  per100g: { kcal: 100, protein: 10, carbs: 10, fat: 1 },
  favorite: false,
  updatedAt: '2026-10-15T10:00:00.000Z',
  ...extra,
})
const names = (l: Food[]) => l.map((f) => f.name)

describe('normalizeFoodSearch', () => {
  it('minuscules, accents, ligatures, ponctuation', () => {
    expect(normalizeFoodSearch('Œuf, Brouillé !')).toBe('oeuf brouille')
    expect(normalizeFoodSearch("Flocons d'avoine")).toBe('flocons d avoine')
    expect(normalizeFoodSearch('  Pâtes   (cuites) ')).toBe('pates cuites')
    expect(normalizeFoodSearch('Crème fraîche 30%')).toBe('creme fraiche 30')
    expect(normalizeFoodSearch('')).toBe('')
  })
})

describe('searchFoods', () => {
  const foods = [
    food('Poulet, filet, cru'),
    food('Poulet, blanc, cuit'),
    food('Filet de poulet rôti'),
    food('Oeuf cru'),
    food('Oeuf dur'),
    food('Oeufs brouillés'),
    food('Banane'),
    food('Pâtes cuites'),
    food('Pois chiches'),
    food('Poivre noir'),
  ]
  it("préfixes de mots dans n'importe quel ordre", () => {
    expect(names(searchFoods(foods, 'poul cru'))).toEqual(['Poulet, filet, cru'])
    expect(names(searchFoods(foods, 'cru poul'))).toEqual(['Poulet, filet, cru'])
  })
  it('sans accents, casse indifférente', () => {
    expect(names(searchFoods(foods, 'PATES'))).toEqual(['Pâtes cuites'])
    expect(names(searchFoods(foods, 'pâtes'))).toEqual(['Pâtes cuites'])
  })
  it('oeuf / œuf / pluriel simple', () => {
    expect(names(searchFoods(foods, 'œuf')).sort()).toEqual(
      ['Oeuf cru', 'Oeuf dur', 'Oeufs brouillés'].sort(),
    )
    expect(names(searchFoods(foods, 'oeufs'))).toContain('Oeuf cru')
    expect(names(searchFoods(foods, 'bananes'))).toEqual(['Banane'])
  })
  it('pluriel : pas de troncature des mots courts (« pois » ne trouve pas poivre)', () => {
    expect(names(searchFoods(foods, 'pois'))).toEqual(['Pois chiches'])
  })
  it('requête vide ou sans résultat', () => {
    expect(searchFoods(foods, '')).toEqual([])
    expect(searchFoods(foods, '  !! ')).toEqual([])
    expect(searchFoods(foods, 'zzz')).toEqual([])
  })
  it('classement : commence par la requête avant le reste', () => {
    expect(names(searchFoods(foods, 'poulet'))[0]).toBe('Poulet, filet, cru')
    expect(names(searchFoods(foods, 'poulet')).at(-1)).toBe('Filet de poulet rôti')
  })
  it('classement : favoris puis perso puis nom court', () => {
    const list = [
      food('Riz long'),
      food('Riz'),
      food('Riz maison', { source: 'user' }),
      food('Riz complet', { favorite: true }),
      food('Riz basmati très long nom', { favorite: true, source: 'user' }),
    ]
    expect(names(searchFoods(list, 'riz'))).toEqual([
      'Riz basmati très long nom', // favori + perso (nom long mais favori d'abord)
      'Riz complet', // favori
      'Riz maison', // perso
      'Riz',
      'Riz long',
    ])
  })
  it('« commence par » prime sur favori', () => {
    const list = [food('Sauce riz', { favorite: true }), food('Riz')]
    expect(names(searchFoods(list, 'riz'))).toEqual(['Riz', 'Sauce riz'])
  })
  it('favoritesFirst: false', () => {
    const list = [food('Riz complet', { favorite: true }), food('Riz')]
    expect(names(searchFoods(list, 'riz', { favoritesFirst: false }))).toEqual(['Riz', 'Riz complet'])
  })
  it('limit', () => {
    const many = Array.from({ length: 50 }, (_, i) => food(`Pomme ${i}`))
    expect(searchFoods(many, 'pomme', { limit: 5 })).toHaveLength(5)
    expect(searchFoods(many, 'pomme')).toHaveLength(30)
  })
  it('cherche aussi la marque', () => {
    const list = [food('Skyr nature', { source: 'off', brand: 'Danone' }), food('Skyr')]
    expect(names(searchFoods(list, 'skyr danone'))).toEqual(['Skyr nature'])
  })
})

describe('performance', () => {
  it('moins de 10 ms par recherche sur 3 000 aliments (index pré-calculé)', () => {
    const foods = ciqualDatasetToFoods(real as unknown as CiqualDataset).map((c) =>
      ciqualToFood(c, '2026-10-15T10:00:00.000Z'),
    )
    expect(foods.length).toBeGreaterThan(3000)
    const index = buildFoodIndex(foods)
    const queries = ['poul cru', 'riz', 'oeufs', 'flocons avoine', 'banane', 'f']
    searchFoodIndex(index, 'warmup')
    const t0 = performance.now()
    const runs = 20
    for (let i = 0; i < runs; i++) for (const q of queries) searchFoodIndex(index, q)
    const avg = (performance.now() - t0) / (runs * queries.length)
    expect(avg).toBeLessThan(10)
    expect(searchFoodIndex(index, 'poul cru').some((f) => f.name.startsWith('Poulet'))).toBe(true)
  })
})
