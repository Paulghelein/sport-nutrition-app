import { describe, expect, it } from 'vitest'
import { validateRecipeInput } from '../../db/validation'
import { parseImport } from './import'

// Comme l'écran d'import : le validateur de la couche de données est injecté.
const ctx = { today: '2026-10-16', ciqual: [], validateRecipe: validateRecipeInput }
const recipe = (over: Record<string, unknown> = {}) => ({
  type: 'recipe',
  name: 'Test',
  meal: ['dejeuner'],
  servings: 2,
  prepMinutes: 5,
  cookMinutes: 5,
  ingredients: [{ name: 'Riz', grams: 200, per100g: { kcal: 350, protein: 7, carbs: 77, fat: 1 } }],
  steps: ['Cuire.'],
  ...over,
})
const kinds = (text: string) => {
  const r = parseImport(text, ctx)
  return r.ok ? r.items.map((i) => i.kind) : r.error
}

describe('parseImport : cas limites', () => {
  it('grammes négatifs, nuls ou textuels : élément invalide, pas d’exception', () => {
    for (const grams of [-5, 0, 'beaucoup', null, 1e12, 1e7]) {
      const text = JSON.stringify([recipe({ ingredients: [{ name: 'Riz', grams }] })])
      expect(() => parseImport(text, ctx)).not.toThrow()
      expect(kinds(text)).toEqual(['invalid'])
    }
  })

  it('portions à 0 ou négatives : invalide', () => {
    for (const servings of [0, -1, 'a']) {
      expect(kinds(JSON.stringify([recipe({ servings })]))).toEqual(['invalid'])
    }
  })

  it('noms hostiles (__proto__, très long) : pas d’exception', () => {
    const text = JSON.stringify([recipe({ name: '__proto__' }), recipe({ name: 'x'.repeat(5000) })])
    expect(() => parseImport(text, ctx)).not.toThrow()
    const r = parseImport(text, ctx)
    expect(r.ok && r.items[0]?.kind).toBe('recipe')
    expect(r.ok && r.items[1]?.kind).toBe('invalid')
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('l’index des éléments suit leur position dans le tableau d’origine', () => {
    const r = parseImport(JSON.stringify([recipe({ servings: 0 }), recipe(), recipe({ name: 'B' })]), ctx)
    expect(r.ok && r.items.map((i) => i.index)).toEqual([0, 1, 2])
  })

  it('tableau vide : message d’erreur clair, pas un aperçu vide', () => {
    const r = parseImport('[]', ctx)
    expect(r).toEqual({ ok: false, error: 'Aucun élément à importer.' })
  })
})
