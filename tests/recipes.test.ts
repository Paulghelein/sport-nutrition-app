import { describe, expect, it } from 'vitest'
import ciqualJson from '../src/content/foods/ciqual.json'
import { SEED_RECIPES } from '../src/content/recipes'
import { recipeSchema } from '../src/db/schemas'
import { macrosFor, sumMacros } from '../src/domain/nutrition'
import type { Aisle, CiqualDataset, Per100g, Recipe } from '../src/types'

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
const AISLES: readonly Aisle[] = [
  'produce',
  'butcher',
  'fish',
  'dairy',
  'grocery',
  'frozen',
  'bakery',
  'other',
]

const ciqual = ciqualJson as unknown as CiqualDataset
const byCode = new Map(ciqual.foods.map((r) => [r[0], r] as const))

function ciqualPer100g(code: string): Per100g {
  const r = byCode.get(code)
  if (!r) throw new Error(`code Ciqual inconnu : ${code}`)
  return { kcal: r[3], protein: r[4], carbs: r[5], fat: r[6], fiber: r[7] ?? undefined }
}

function perServing(r: Recipe) {
  const total = sumMacros(
    r.ingredients.map((i) => {
      const p = i.per100g ?? (i.ciqualCode ? ciqualPer100g(i.ciqualCode) : undefined)
      if (!p) throw new Error(`${r.id} / ${i.name} : aucune donnée nutritionnelle`)
      return macrosFor(p, i.grams)
    }),
  )
  return { kcal: total.kcal / r.servings, protein: total.protein / r.servings }
}

describe('recettes de départ', () => {
  it('39 recettes, ids uniques en kebab-case', () => {
    expect(SEED_RECIPES).toHaveLength(39)
    const ids = SEED_RECIPES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id, id).toMatch(KEBAB)
  })

  it.each(SEED_RECIPES.map((r) => [r.id, r] as const))('%s : structure', (_id, r) => {
    expect(recipeSchema.safeParse(r).success, JSON.stringify(recipeSchema.safeParse(r))).toBe(true)
    expect(r.source).toBe('seed')
    expect(r.servings).toBeGreaterThanOrEqual(1)
    expect(r.meal.length).toBeGreaterThan(0)
    expect(r.ingredients.length).toBeGreaterThanOrEqual(1)
    expect(r.steps.length).toBeGreaterThanOrEqual(1)
    if (r.fridgeDays !== undefined) expect(r.fridgeDays).toBeLessThanOrEqual(4)
    for (const i of r.ingredients) {
      const tag = `${r.id} / ${i.name}`
      expect(i.grams, tag).toBeGreaterThan(0)
      expect(AISLES, tag).toContain(i.aisle)
      if (i.ciqualCode !== undefined) {
        expect(byCode.has(i.ciqualCode), `${tag} : code ${i.ciqualCode} absent de Ciqual`).toBe(true)
        expect(i.foodId, tag).toBe(`ciqual-${i.ciqualCode}`)
      } else {
        expect(i.per100g, `${tag} : ni ciqualCode ni per100g`).toBeDefined()
      }
    }
  })

  it.each(SEED_RECIPES.map((r) => [r.id, r] as const))('%s : macros par portion', (_id, r) => {
    const m = perServing(r)
    const snackOnly = r.meal.every((s) => s === 'snack')
    expect(m.protein, `${r.id} protéines/portion`).toBeGreaterThanOrEqual(snackOnly ? 15 : 30)
    expect(m.kcal, `${r.id} kcal/portion`).toBeGreaterThanOrEqual(200)
    expect(m.kcal, `${r.id} kcal/portion`).toBeLessThanOrEqual(1200)
  })

  it('tableau récapitulatif', () => {
    const rows = SEED_RECIPES.map((r) => {
      const m = perServing(r)
      return {
        id: r.id,
        meal: r.meal.join('+'),
        kcal: Math.round(m.kcal),
        prot: Math.round(m.protein * 10) / 10,
      }
    })
    console.log(rows.map((r) => `${r.id} [${r.meal}] ${r.kcal} kcal ${r.prot} g`).join('\n'))
    expect(rows).toHaveLength(SEED_RECIPES.length)
  })
})
