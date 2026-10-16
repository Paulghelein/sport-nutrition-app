import { describe, expect, it } from 'vitest'
import dataset from '../../content/foods/ciqual.json'
import { ciqualDatasetToFoods } from '../nutrition/ciqual'
import type { CiqualDataset } from '../../types/nutrition'
import type { CiqualFood } from '../../types/nutrition'
import { extractJsonPayload, importedMealEntry, parseImport } from './import'

const ciq = (code: string, name: string, kcal = 100): CiqualFood => ({
  id: `ciqual-${code}`,
  code,
  name,
  group: 'g',
  search: name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim(),
  per100g: { kcal, protein: 1, carbs: 1, fat: 1 },
})

const CIQUAL = [
  ciq('36005', 'Poulet, blanc, cru'),
  ciq('20009', 'Brocoli, cuit'),
  ciq('20010', 'Brocoli, cru'),
  ciq('20011', 'Brocoli, surgelé, cuit à l\'eau'),
  ciq('9100', 'Pâtes alimentaires, cuites'),
]
const ctx = { today: '2026-10-16', ciqual: CIQUAL }

const RECIPE = {
  type: 'recipe',
  name: 'Poulet, riz basmati et brocoli',
  meal: ['dejeuner', 'diner'],
  servings: 4,
  prepMinutes: 15,
  cookMinutes: 25,
  fridgeDays: 4,
  tags: ['batch', 'riche-en-proteines'],
  ingredients: [
    { name: 'Blanc de poulet cru', grams: 600, ciqualCode: '36005', aisle: 'boucherie' },
    { name: 'Riz basmati cru', grams: 320, aisle: 'epicerie', per100g: { kcal: 354, protein: 8.1, carbs: 77.5, fat: 0.9 } },
    { name: 'Brocoli', grams: 500, aisle: 'fruits-legumes' },
  ],
  steps: ['Cuire le riz.', 'Saisir le poulet en dés.', 'Cuire le brocoli à la vapeur 6 min.', 'Répartir en 4 boîtes.'],
}
const MEAL = {
  type: 'meal',
  name: 'Burger frites au resto',
  date: '2026-10-15',
  slot: 'diner',
  estimated: true,
  totals: { kcal: 1150, protein: 45, carbs: 110, fat: 58 },
}

describe('extractJsonPayload', () => {
  it('tableau, objet seul', () => {
    expect(extractJsonPayload('[1,2]')).toEqual({ ok: true, value: [1, 2] })
    expect(extractJsonPayload(' {"a":1} ')).toEqual({ ok: true, value: { a: 1 } })
  })
  it('dernier bloc json d\'un texte avec prose', () => {
    const t = 'Voici.\n```json\n[{"a":1}]\n```\nOu plutôt :\n```json\n[{"a":2}]\n```\nBon appétit [!]'
    expect(extractJsonPayload(t)).toEqual({ ok: true, value: [{ a: 2 }] })
  })
  it('à défaut, premier tableau équilibré (crochets dans les chaînes)', () => {
    const t = 'Ok [note] puis [{"a":"x]y"}] fin'
    expect(extractJsonPayload(t)).toEqual({ ok: true, value: [{ a: 'x]y' }] })
  })
  it('erreurs', () => {
    expect(extractJsonPayload('bonjour').ok).toBe(false)
    expect(extractJsonPayload('```json\n[{"a":1,}]\n```')).toMatchObject({ ok: false })
  })
})

describe('parseImport : exemple IMPORT_FORMAT.md', () => {
  const r = parseImport(JSON.stringify([RECIPE, MEAL]), ctx)
  it('recette convertie', () => {
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [a, b] = r.items
    expect(a).toMatchObject({ kind: 'recipe', index: 0 })
    if (a?.kind !== 'recipe') throw new Error()
    expect(a.recipe.meal).toEqual(['lunch', 'dinner'])
    expect(a.recipe.ingredients.map((i) => i.aisle)).toEqual(['butcher', 'grocery', 'produce'])
    expect(a.recipe.fridgeDays).toBe(4)
    expect(a.recipe.steps).toHaveLength(4)
    // Brocoli relié à Ciqual : le plus court nom ("Brocoli, cru").
    expect(a.recipe.ingredients[2]?.ciqualCode).toBe('20010')
    expect(a.warnings).toEqual(['Brocoli : relié à Ciqual : Brocoli, cru'])
    // per100g conservé sans code
    expect(a.recipe.ingredients[1]?.per100g?.kcal).toBe(354)
    expect(b).toMatchObject({
      kind: 'meal',
      index: 1,
      warnings: [],
      meal: { name: 'Burger frites au resto', date: '2026-10-15', slot: 'dinner', estimated: true, totals: { kcal: 1150, fat: 58 } },
    })
  })
})

describe('recettes : cas limites', () => {
  const one = (o: unknown, c: { today: string; ciqual?: CiqualFood[] } = ctx) => {
    const r = parseImport(JSON.stringify(o), c)
    if (!r.ok) throw new Error(r.error)
    const first = r.items[0]
    if (!first) throw new Error('vide')
    return first
  }
  it('défauts et variantes de valeurs', () => {
    const it0 = one({
      type: 'recipe',
      name: ' Omelette ',
      meal: 'Petit-déj',
      servings: '2',
      ingredients: [{ name: 'Oeuf', grams: '120,5', aisle: 'Crèmerie' }, { name: 'Pois surgelés', grams: 50, aisle: 'surgelés' }],
    })
    expect(it0).toMatchObject({
      kind: 'recipe',
      recipe: { name: 'Omelette', meal: ['breakfast'], servings: 2, prepMinutes: 0, cookMinutes: 0, tags: [], steps: [] },
    })
    if (it0.kind !== 'recipe') return
    expect(it0.recipe.ingredients.map((i) => [i.grams, i.aisle])).toEqual([[120.5, 'dairy'], [50, 'frozen']])
    expect(it0.recipe.fridgeDays).toBeUndefined()
    expect(one({ type: 'recipe', name: 'x', meal: ['Dîner', 'english'], servings: 1, ingredients: [{ name: 'a', grams: 1 }] })).toMatchObject({ kind: 'invalid' })
    const noAisle = one({ type: 'recipe', name: 'x', meal: ['dîner'], servings: 1, ingredients: [{ name: 'a', grams: 1, per100g: { kcal: 1, protein: 1, carbs: 1, fat: 1 } }] })
    expect(noAisle).toMatchObject({ kind: 'recipe', recipe: { meal: ['dinner'], ingredients: [{ aisle: 'other' }] } })
  })
  it('erreurs lisibles en français', () => {
    const bad = one({
      type: 'recipe',
      name: 'x',
      meal: [],
      servings: 0,
      ingredients: [
        { name: 'a', grams: 5 },
        { name: 'b', aisle: 'epicerie' },
      ],
    })
    expect(bad).toMatchObject({ kind: 'invalid' })
    if (bad.kind !== 'invalid') return
    expect(bad.errors).toContain('ingrédient 2 : grammes manquants')
    expect(bad.errors).toContain('repas manquant')
    expect(bad.errors).toContain('portions invalides')
    const noIng = one({ type: 'recipe', name: 'x', meal: ['diner'], servings: 1 })
    expect(noIng).toMatchObject({ kind: 'invalid', errors: ['aucun ingrédient'] })
    const badAisle = one({ type: 'recipe', name: 'x', meal: ['diner'], servings: 1, ingredients: [{ name: 'a', grams: 1, aisle: 'cave' }] })
    expect(badAisle).toMatchObject({ kind: 'invalid', errors: ['ingrédient 1 : rayon inconnu « cave »'] })
    const badMacro = one({ type: 'recipe', name: 'x', meal: ['diner'], servings: 1, ingredients: [{ name: 'a', grams: 1, per100g: { kcal: 1, protein: 1, carbs: 1 } }] })
    expect(badMacro).toMatchObject({ kind: 'invalid', errors: ['ingrédient 1, valeurs pour 100 g : lipides manquants'] })
  })
  it('code Ciqual valide : per100g ignoré ; inconnu : conservé en repli + warning', () => {
    const p = { kcal: 1, protein: 1, carbs: 1, fat: 1 }
    const it0 = one({
      type: 'recipe',
      name: 'x',
      meal: ['diner'],
      servings: 1,
      ingredients: [
        { name: 'Poulet', grams: 100, ciqualCode: '36005', per100g: p },
        { name: 'Truc', grams: 100, ciqualCode: '99999', per100g: p },
        { name: 'Machin inconnu', grams: 100 },
      ],
    })
    if (it0.kind !== 'recipe') throw new Error()
    const [a, b, c] = it0.recipe.ingredients
    expect(a?.per100g).toBeUndefined()
    expect(b).toMatchObject({ ciqualCode: '99999', per100g: p })
    expect(c?.ciqualCode).toBeUndefined()
    expect(it0.warnings).toHaveLength(2)
    expect(it0.warnings[0]).toContain('99999')
    expect(it0.warnings[1]).toBe('Machin inconnu : pas de valeurs nutritionnelles')
  })
  it('appariement prudent : tous les mots requis, pas de demi-correspondance', () => {
    const it0 = one({
      type: 'recipe', name: 'x', meal: ['diner'], servings: 1,
      ingredients: [
        { name: 'Poulet rôti', grams: 1 },
        { name: 'Pâtes cuites', grams: 1 },
        { name: 'Brocolis surgelés', grams: 1 },
      ],
    })
    if (it0.kind !== 'recipe') throw new Error()
    expect(it0.recipe.ingredients.map((i) => i.ciqualCode)).toEqual([undefined, '9100', '20011'])
  })
  it('sans ctx.ciqual : pas d\'appariement, warning sans valeurs', () => {
    const it0 = one({ type: 'recipe', name: 'x', meal: ['diner'], servings: 1, ingredients: [{ name: 'Brocoli', grams: 1 }] }, { today: '2026-10-16' })
    expect(it0).toMatchObject({ kind: 'recipe', warnings: ['Brocoli : pas de valeurs nutritionnelles'] })
  })
})

describe('repas', () => {
  const one = (o: Record<string, unknown>) => {
    const r = parseImport(JSON.stringify([{ ...MEAL, ...o }]), ctx)
    if (!r.ok) throw new Error(r.error)
    const first = r.items[0]
    if (!first) throw new Error('vide')
    return first
  }
  it('défauts : date du jour, estimated true, macros manquantes à 0 avec warning', () => {
    const m = one({ date: undefined, estimated: undefined, totals: { kcal: 600 } })
    expect(m).toMatchObject({ kind: 'meal', meal: { date: '2026-10-16', estimated: true, totals: { kcal: 600, protein: 0, carbs: 0, fat: 0 } } })
    if (m.kind === 'meal') expect(m.warnings).toHaveLength(3)
  })
  it('date invalide ou trop future', () => {
    expect(one({ date: '2026-02-30' })).toMatchObject({ kind: 'invalid' })
    expect(one({ date: '2026-10-18' })).toMatchObject({ kind: 'invalid' })
    expect(one({ date: '2026-10-17' })).toMatchObject({ kind: 'meal' })
  })
  it('kcal manquant ou négatif', () => {
    expect(one({ totals: { protein: 3 } })).toMatchObject({ kind: 'invalid', errors: ['totaux : kcal manquants'] })
    expect(one({ totals: { kcal: -5 } })).toMatchObject({ kind: 'invalid' })
  })
  it('importedMealEntry fige les macros', () => {
    const m = one({})
    if (m.kind !== 'meal') throw new Error()
    expect(importedMealEntry(m.meal, { id: 'e1', createdAt: '2026-10-16T12:00:00.000Z' })).toEqual({
      id: 'e1',
      date: '2026-10-15',
      slot: 'dinner',
      name: 'Burger frites au resto',
      origin: { kind: 'import', estimated: true },
      macros: { kcal: 1150, protein: 45, carbs: 110, fat: 58 },
      createdAt: '2026-10-16T12:00:00.000Z',
    })
  })
})

describe('parseImport : tableau mixte et robustesse', () => {
  it('texte de Claude avec prose, élément invalide au milieu, types non gérés', () => {
    const arr = [
      RECIPE,
      { type: 'meal', name: 'Sans slot', totals: { kcal: 1 } },
      { type: 'exercisePreference', exerciseId: 'a', preference: 'liked' },
      { type: 'sessionPlan', blocks: [] },
      { type: 'exercise', name: 'x' },
      { type: 'banane' },
      { name: 'sans type' },
      42,
      MEAL,
    ]
    const text = `Voici ta recette !\n\n\`\`\`json\n${JSON.stringify(arr, null, 2)}\n\`\`\`\nBon courage.`
    const r = parseImport(text, ctx)
    if (!r.ok) throw new Error(r.error)
    expect(r.items.map((i) => i.kind)).toEqual(['recipe', 'invalid', 'unsupported', 'unsupported', 'unsupported', 'invalid', 'invalid', 'invalid', 'meal'])
    expect(r.items.map((i) => i.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(r.items[2]).toMatchObject({ type: 'exercisePreference', message: expect.stringContaining('Coller la réponse de Claude') })
    expect(r.items[5]).toMatchObject({ errors: ['type inconnu « banane »'] })
  })
  it('objet seul, null ignorés', () => {
    const r = parseImport(JSON.stringify({ ...MEAL, estimated: null }), ctx)
    expect(r).toMatchObject({ ok: true, items: [{ kind: 'meal', meal: { estimated: true } }] })
  })
  it('JSON cassé, vide, scalaire', () => {
    expect(parseImport('[{"type":"meal",', ctx).ok).toBe(false)
    expect(parseImport('[]', ctx)).toEqual({ ok: false, error: 'Aucun élément à importer.' })
    expect(parseImport('12', ctx).ok).toBe(false)
    expect(parseImport('', ctx).ok).toBe(false)
  })
})

describe('appariement Ciqual sur le vrai jeu', () => {
  const real = ciqualDatasetToFoods(dataset as unknown as CiqualDataset)
  const link = (name: string): string | undefined => {
    const r = parseImport(
      JSON.stringify([{ type: 'recipe', name: 'x', meal: ['diner'], servings: 1, ingredients: [{ name, grams: 100 }] }]),
      { today: '2026-10-16', ciqual: real },
    )
    if (!r.ok) throw new Error(r.error)
    const it0 = r.items[0]
    if (it0?.kind !== 'recipe') throw new Error('recette attendue')
    const code = it0.recipe.ingredients[0]?.ciqualCode
    return code === undefined ? undefined : real.find((c) => c.code === code)?.name
  }
  it('aucun faux positif connu', () => {
    const bad: Record<string, RegExp> = {
      Avocat: /huile/i,
      Cacao: /beurre|poudre/i,
      'Pâtes': /pât[ée]\b(?!s)|breton/i,
      Pates: /breton|^pâté/i,
      Lait: /coco/i,
      Banane: /nectar/i,
      'Pommes de terre': /fécule/i,
      Tomate: /séch/i,
      Spaghetti: /courge/i,
      Sucre: /cola/i,
      Riz: /son de riz/i,
      Poulet: /foie/i,
      Saumon: /fumé/i,
      Amandes: /dragée/i,
    }
    for (const [q, re] of Object.entries(bad)) {
      const hit = link(q)
      if (hit !== undefined) expect(hit, q).not.toMatch(re)
    }
    expect(link('Spaghetti')).toBeUndefined()
    expect(link('Avocat')).toBeUndefined()
  })
  it('bons appariements', () => {
    expect(link('Brocoli')).toBe('Brocoli, cru')
    expect(link('Poulet')).toMatch(/^Poulet/)
    expect(link('Blanc de poulet cru')).toMatch(/^Poulet/)
    expect(link('Pommes de terre')).toMatch(/^Pomme de terre/)
    expect(link('Riz')).toMatch(/^Riz/)
  })
})

describe('validateurs injectés', () => {
  it('recette et repas refusés par la règle métier', () => {
    const r = parseImport(JSON.stringify([RECIPE, MEAL, MEAL]), {
      today: '2026-10-16',
      validateRecipe: (x) => (x.name.startsWith('Poulet') ? 'nom interdit' : null),
      validateEntry: (e) => (e.macros.kcal > 1000 ? 'trop de kcal' : null),
    })
    if (!r.ok) throw new Error(r.error)
    expect(r.items).toEqual([
      { kind: 'invalid', index: 0, errors: ['nom interdit'] },
      { kind: 'invalid', index: 1, errors: ['trop de kcal'] },
      { kind: 'invalid', index: 2, errors: ['trop de kcal'] },
    ])
  })
})
