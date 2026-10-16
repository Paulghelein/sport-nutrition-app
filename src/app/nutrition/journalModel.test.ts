import { describe, expect, it } from 'vitest'
import { defaultNutritionParams } from '../../db/defaults'
import type { Food, FoodLogEntry, Profile, WeighIn } from '../../types'
import { buildJournalModel, dayLabel, entryQuantity, mealCopies } from './journalModel'
import type { JournalInput } from './journalModel'

const T0 = '2026-10-16T08:00:00.000Z'
const TODAY = '2026-10-16'
const YESTERDAY = '2026-10-15'

const profile: Profile = {
  id: 'me',
  sex: 'male',
  birthDate: '1998-05-12',
  heightCm: 178,
  activityLevel: 'moderate',
  goal: 'bulk',
  level: 1,
  weeklySessionsTarget: 3,
  weeklySessionsMin: 2,
  nutrition: { ...defaultNutritionParams },
  createdAt: T0,
  updatedAt: T0,
} as unknown as Profile

const weighIns: WeighIn[] = [{ id: 'w', date: TODAY, weightKg: 72, createdAt: T0 }]

function entry(id: string, overrides: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id,
    date: TODAY,
    slot: 'lunch',
    name: 'Riz cuit',
    origin: { kind: 'food', foodId: 'ciqual-9100', grams: 150 },
    macros: { kcal: 195.4, protein: 4.05, carbs: 42, fat: 0.45 },
    createdAt: `2026-10-16T12:00:0${id.length}.000Z`,
    ...overrides,
  }
}

const skyr: Food = {
  id: 'off-123',
  name: 'Skyr nature',
  source: 'off',
  ean: '123',
  per100g: { kcal: 60, protein: 10, carbs: 4, fat: 0.2 },
  favorite: false,
  updatedAt: T0,
}

function input(overrides: Partial<JournalInput> = {}): JournalInput {
  return {
    date: TODAY,
    today: TODAY,
    entries: [],
    yesterday: [],
    foods: new Map(),
    ciqualGroups: new Map(),
    profile,
    weighIns,
    ...overrides,
  }
}

describe('dayLabel', () => {
  it('aujourd’hui, hier, demain, sinon date longue', () => {
    expect(dayLabel(TODAY, TODAY)).toBe('Aujourd’hui')
    expect(dayLabel(YESTERDAY, TODAY)).toBe('Hier')
    expect(dayLabel('2026-10-17', TODAY)).toBe('Demain')
    expect(dayLabel('2026-10-10', TODAY)).toBe('samedi 10 octobre 2026')
  })
})

describe('entryQuantity', () => {
  it('grammes, portions (singulier avant 2), frigo, saisie libre, import', () => {
    expect(entryQuantity(entry('a'), false)).toBe('150 g')
    const recipe = (portions: number) => entry('r', { origin: { kind: 'recipe', recipeId: 'x', portions } })
    expect(entryQuantity(recipe(1.5), false)).toBe('1,5 portion')
    expect(entryQuantity(recipe(2), true)).toBe('2 portions · depuis le frigo')
    expect(entryQuantity(entry('f', { origin: { kind: 'free' } }), false)).toBe('Saisie libre')
    expect(entryQuantity(entry('i', { origin: { kind: 'import', estimated: false } }), false)).toBe('Importé')
  })
})

describe('buildJournalModel', () => {
  it('jour vide : quatre repas vides, bilan à zéro, navigation', () => {
    const m = buildJournalModel(input())
    expect(m.meals.map((x) => x.slot)).toEqual(['breakfast', 'lunch', 'dinner', 'snack'])
    expect(m.meals.every((x) => x.rows.length === 0 && x.kcal === 0 && !x.canCopy)).toBe(true)
    expect(m.bilan.totals.kcal).toBe(0)
    expect(m.bilan.targets?.kcal).toBeGreaterThan(1500)
    expect(m.bilan.left).toBe(m.bilan.targets?.kcal)
    expect(m.bilan.over).toBe(0)
    expect(m.bilan.ratio).toBe(0)
    expect(m.photoFoodIds).toEqual([])
  })

  it('sans profil ou sans pesée : pas d’objectifs, pas de reste', () => {
    expect(buildJournalModel(input({ profile: undefined })).bilan.targets).toBeUndefined()
    const m = buildJournalModel(input({ weighIns: [] }))
    expect(m.bilan.targets).toBeUndefined()
    expect(m.bilan.ratio).toBe(0)
    expect(m.bilan.left).toBe(0)
    expect(m.suggestion).toBeUndefined()
  })

  it('totaux arrondis, reste ou dépassement, ratio plafonné', () => {
    const m = buildJournalModel(input({ entries: [entry('a'), entry('bb', { slot: 'dinner' })] }))
    expect(m.bilan.totals.kcal).toBe(391)
    const target = m.bilan.targets?.kcal ?? 0
    expect(m.bilan.left).toBe(Math.round(target - 390.8))
    const big = entry('c', { macros: { kcal: 9000, protein: 0, carbs: 0, fat: 0 } })
    const over = buildJournalModel(input({ entries: [big] })).bilan
    expect(over.ratio).toBe(1)
    expect(over.left).toBe(0)
    expect(over.over).toBe(Math.round(9000 - target))
  })

  it('lignes : quantité, macros arrondies, libellé du bouton, total du repas', () => {
    const m = buildJournalModel(input({ entries: [entry('a')] }))
    const lunch = m.meals.find((x) => x.slot === 'lunch')
    expect(lunch?.kcal).toBe(195)
    expect(lunch?.rows).toHaveLength(1)
    const row = lunch?.rows[0]
    expect(row?.quantity).toBe('150 g')
    expect(row?.macros).toEqual({ kcal: 195, protein: 4.1, carbs: 42, fat: 0.5 })
    expect(row?.ariaLabel).toBe('Modifier Riz cuit, 195 kcal')
  })

  it('visuels : groupe Ciqual → catégorie, produit scanné → photo, frigo, saisie libre', () => {
    const entries = [
      entry('a'),
      entry('bb', {
        name: 'Skyr nature · Siggi’s',
        origin: { kind: 'food', foodId: skyr.id, grams: 200 },
      }),
      entry('ccc', {
        name: 'Poulet, riz',
        origin: { kind: 'recipe', recipeId: 'r', portions: 1.5, fridgeItemId: 'f1' },
      }),
      entry('dddd', { name: 'Pizza', origin: { kind: 'free' } }),
    ]
    const m = buildJournalModel(
      input({
        entries,
        foods: new Map([[skyr.id, skyr]]),
        ciqualGroups: new Map([['ciqual-9100', 'produits céréaliers']]),
      }),
    )
    const rows = m.meals.find((x) => x.slot === 'lunch')?.rows ?? []
    const byName = (n: string) => rows.find((r) => r.entry.name === n)
    expect(byName('Riz cuit')?.visual).toEqual({ category: 'starch', scanned: false, fromFridge: false })
    const scanned = byName('Skyr nature · Siggi’s')
    expect(scanned?.visual.scanned).toBe(true)
    expect(scanned?.visual.photoFoodId).toBe(skyr.id)
    expect(byName('Poulet, riz')?.visual).toEqual({ category: 'dish', scanned: false, fromFridge: true })
    expect(byName('Poulet, riz')?.quantity).toBe('1,5 portion · depuis le frigo')
    expect(byName('Pizza')?.visual.category).toBe('dish')
    expect(m.photoFoodIds).toEqual([skyr.id])
  })

  it('photoFoodIds sans doublon', () => {
    const e = (id: string) => entry(id, { origin: { kind: 'food', foodId: skyr.id, grams: 100 } })
    const m = buildJournalModel(input({ entries: [e('a'), e('bb')], foods: new Map([[skyr.id, skyr]]) }))
    expect(m.photoFoodIds).toEqual([skyr.id])
  })

  it('aliment supprimé : repli sur le nom, pas de photo', () => {
    const m = buildJournalModel(
      input({
        entries: [entry('a', { name: 'Skyr nature', origin: { kind: 'food', foodId: 'gone', grams: 100 } })],
      }),
    )
    const v = m.meals[1]?.rows[0]?.visual
    expect(v?.scanned).toBe(false)
    expect(v?.photoFoodId).toBeUndefined()
    expect(v?.category).toBe('dairy')
  })

  it('canCopy : la veille a des entrées pour ce repas', () => {
    const y = entry('y', { date: YESTERDAY, slot: 'breakfast' })
    const m = buildJournalModel(input({ yesterday: [y] }))
    expect(m.meals.map((x) => x.canCopy)).toEqual([true, false, false, false])
  })

  it('jour passé : pas de suggestion de calories', () => {
    expect(buildJournalModel(input({ date: YESTERDAY })).suggestion).toBeUndefined()
  })
})

describe('mealCopies', () => {
  it('copie le repas de la veille vers le jour affiché, sans le lien au frigo', () => {
    const y = entry('y', {
      date: YESTERDAY,
      slot: 'breakfast',
      origin: { kind: 'recipe', recipeId: 'r', portions: 1, fridgeItemId: 'f1' },
    })
    let n = 0
    const copies = mealCopies({ date: TODAY, yesterday: [y] }, 'breakfast', {
      newId: () => `new-${n++}`,
      now: '2026-10-16T09:00:00.000Z',
    })
    expect(copies).toHaveLength(1)
    expect(copies[0]?.date).toBe(TODAY)
    expect(copies[0]?.slot).toBe('breakfast')
    expect(copies[0]?.origin).toEqual({ kind: 'recipe', recipeId: 'r', portions: 1 })
    expect(copies[0]?.id).toBe('new-0')
  })

  it('rien à copier : liste vide', () => {
    const ctx = { newId: () => 'x', now: T0 }
    expect(mealCopies({ date: TODAY, yesterday: [] }, 'dinner', ctx)).toEqual([])
  })
})
