import { describe, expect, it } from 'vitest'
import type { CiqualDataset, CiqualFood, Food } from '../../types/nutrition'
import { ciqualDatasetToFoods, ciqualToFood, mergeFoods } from './ciqual'
import { normalizeFoodSearch } from './search'
import real from '../../content/foods/ciqual.json'
import { CIQUAL_VERSION } from '../../content/foods/version'

const ds: CiqualDataset = {
  version: 'test',
  groups: ['Viandes', 'Céréales'],
  foods: [
    ['36017', 'Poulet, filet sans peau cru', 0, 110, 23.4, 0, 1.5, 0],
    ['9119', 'Riz thaï ou basmati, cru', 1, 351, 7.4, 78.4, 0.6, null],
  ],
}
const NOW = '2026-10-15T10:00:00.000Z'

describe('ciqualDatasetToFoods', () => {
  const foods = ciqualDatasetToFoods(ds)
  it('id, groupe et recherche normalisée', () => {
    expect(foods[0]).toMatchObject({
      id: 'ciqual-36017',
      code: '36017',
      group: 'Viandes',
      search: 'poulet filet sans peau cru',
    })
    expect(foods[1]?.search).toBe('riz thai ou basmati cru')
  })
  it('fibres : présentes ou omises', () => {
    expect(foods[0]?.per100g).toEqual({ kcal: 110, protein: 23.4, carbs: 0, fat: 1.5, fiber: 0 })
    expect(foods[1]?.per100g).toEqual({ kcal: 351, protein: 7.4, carbs: 78.4, fat: 0.6 })
  })
})

describe('ciqualToFood', () => {
  it('source ciqual, non favori, updatedAt fourni', () => {
    const f = ciqualToFood(ciqualDatasetToFoods(ds)[0] as CiqualFood, NOW)
    expect(f).toMatchObject({
      id: 'ciqual-36017',
      source: 'ciqual',
      ciqualCode: '36017',
      favorite: false,
      updatedAt: NOW,
      name: 'Poulet, filet sans peau cru',
    })
  })
})

describe('mergeFoods', () => {
  const ciqual = ciqualDatasetToFoods(ds)
  const user: Food = {
    id: 'u1',
    name: 'Mon shake',
    source: 'user',
    per100g: { kcal: 100, protein: 10, carbs: 5, fat: 2 },
    favorite: true,
    updatedAt: NOW,
  }
  const override: Food = {
    ...ciqualToFood(ciqual[0] as CiqualFood, NOW),
    favorite: true,
    per100g: { kcal: 120, protein: 24, carbs: 0, fat: 2 },
  }
  it('sans ligne : tout le Ciqual', () => {
    expect(mergeFoods(ciqual, [])).toHaveLength(2)
  })
  it('la ligne de même id gagne ; perso et OFF ajoutés après', () => {
    const off: Food = { ...user, id: 'off-123', source: 'off', ean: '123', favorite: false }
    const out = mergeFoods(ciqual, [user, override, off])
    expect(out.map((f) => f.id)).toEqual(['ciqual-36017', 'ciqual-9119', 'u1', 'off-123'])
    expect(out[0]).toBe(override)
    expect(out[1]?.favorite).toBe(false)
  })
  it("n'ajoute pas deux fois la surcharge", () => {
    expect(mergeFoods(ciqual, [override]).filter((f) => f.id === 'ciqual-36017')).toHaveLength(1)
  })
})

describe('jeu Ciqual embarqué', () => {
  const data = real as unknown as CiqualDataset
  const byName = (n: string) => data.foods.find((r) => r[1] === n)
  it('version cohérente avec version.ts', () => {
    expect(data.version).toBe(CIQUAL_VERSION)
  })
  it('valeurs de référence (Ciqual 2025)', () => {
    expect(byName('Poulet, filet sans peau cru')?.slice(3)).toEqual([110, 23.4, 0, 1.5, 0])
    expect(byName('Riz thaï ou basmati, cru')?.slice(3)).toEqual([351, 7.4, 78.4, 0.6, 1.1])
    expect(byName("Flocons d'avoine")?.slice(3)).toEqual([369, 11.4, 57.7, 7.8, 11.2])
    expect(byName('Oeuf cru')?.slice(3)).toEqual([140, 12.8, 0.1, 9.8, 0])
    expect(byName('Banane, chair sans peau, crue')?.slice(3)).toEqual([87.6, 1.1, 19.7, 0.3, 2.7])
  })
  it('structure : codes uniques, groupes valides, valeurs finies et positives', () => {
    expect(data.foods.length).toBeGreaterThan(3000)
    expect(new Set(data.foods.map((r) => r[0])).size).toBe(data.foods.length)
    for (const r of data.foods) {
      expect(data.groups[r[2]]).toBeDefined()
      for (const v of r.slice(3)) if (v !== null) expect(v).toBeGreaterThanOrEqual(0)
    }
  })
  it('la recherche normalisée trouve « oeuf » même si la saisie est « œuf »', () => {
    const foods = ciqualDatasetToFoods(data)
    expect(foods.some((f) => f.search.startsWith(normalizeFoodSearch('Œuf')))).toBe(true)
  })
})
