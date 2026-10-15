import { beforeEach, describe, expect, it } from 'vitest'
import type { CiqualFood, Food, FoodInput, FoodLogEntry } from '../types'
import { db } from './database'
import {
  acceptKcalSuggestion,
  addLogEntries,
  createFood,
  deleteFood,
  deleteLogEntry,
  getCiqualFood,
  getCiqualVersion,
  getFoodRow,
  listCiqualFoods,
  listFoodRows,
  listLogBetween,
  listLogForDate,
  replaceCiqual,
  restoreCiqualFood,
  setFoodFavorite,
  updateFood,
  updateLogEntry,
  updateNutritionParams,
} from './nutrition'
import { getSettings, saveProfile, ValidationError } from './repositories'
import { checkFoodInput, checkLogEntry, checkNutritionParams } from './validation'
import { NOW, makeProfile } from './testFixtures'

const T1 = '2026-03-02T09:00:00.000Z'
const T2 = '2026-03-03T09:00:00.000Z'

const rejects = (p: Promise<unknown>, re?: RegExp) =>
  re ? expect(p).rejects.toThrow(re) : expect(p).rejects.toBeInstanceOf(ValidationError)

const rice: CiqualFood = {
  id: 'ciqual-9100',
  code: '9100',
  name: 'Riz cuit',
  group: 'Féculents',
  search: 'riz cuit',
  per100g: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 },
}
const riceFood: Food = {
  id: rice.id,
  name: rice.name,
  source: 'ciqual',
  ciqualCode: rice.code,
  per100g: rice.per100g,
  favorite: false,
  updatedAt: NOW,
}
const input: FoodInput = {
  name: ' Skyr ',
  brand: ' Danone ',
  per100g: { kcal: 60, protein: 10, carbs: 4, fat: 0.2 },
}

function entry(id: string, date = '2026-03-01', overrides: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id,
    date,
    slot: 'lunch',
    name: 'Riz',
    origin: { kind: 'food', foodId: rice.id, grams: 150 },
    macros: { kcal: 195, protein: 4.05, carbs: 42, fat: 0.45 },
    createdAt: NOW,
    ...overrides,
  }
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('Ciqual', () => {
  it('replaceCiqual remplace la table et note la version', async () => {
    expect(await getCiqualVersion()).toBeUndefined()
    await replaceCiqual('2020-r1', [rice], NOW)
    expect(await getCiqualVersion()).toBe('2020-r1')
    expect(await getCiqualFood(rice.id)).toEqual(rice)
    await replaceCiqual('2020-r2', [{ ...rice, id: 'ciqual-1', code: '1' }], T1)
    expect((await listCiqualFoods()).map((f) => f.id)).toEqual(['ciqual-1'])
    expect((await getSettings()).ciqualVersion).toBe('2020-r2')
    expect((await getSettings()).updatedAt).toBe(T1)
  })

  it('conserve les autres réglages et refuse une version vide', async () => {
    await db.settings.put({
      ...(await getSettings()),
      coachUrl: 'https://claude.ai/x',
      onboardingCompleted: true,
    })
    await replaceCiqual('v', [], NOW)
    const s = await getSettings()
    expect(s.coachUrl).toBe('https://claude.ai/x')
    expect(s.onboardingCompleted).toBe(true)
    await rejects(replaceCiqual(' ', [rice], NOW))
  })

  it('charge ~3 000 lignes rapidement', async () => {
    const many = Array.from({ length: 3000 }, (_, i) => ({ ...rice, id: `ciqual-${i}`, code: String(i) }))
    const t0 = performance.now()
    await replaceCiqual('big', many, NOW)
    expect(performance.now() - t0).toBeLessThan(3000)
    expect(await db.ciqual.count()).toBe(3000)
  })
})

describe('aliments', () => {
  it('createFood : UUID, source user, non favori, champs nettoyés', async () => {
    const f = await createFood({ ...input, defaultPortionG: 125, aisle: 'dairy' }, NOW)
    expect(f).toMatchObject({
      name: 'Skyr',
      brand: 'Danone',
      source: 'user',
      favorite: false,
      defaultPortionG: 125,
      aisle: 'dairy',
      updatedAt: NOW,
    })
    expect(f.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await getFoodRow(f.id)).toEqual(f)
    expect(await listFoodRows()).toHaveLength(1)
    const bare = await createFood(
      { name: 'Pain', brand: '  ', per100g: { kcal: 250, protein: 8, carbs: 50, fat: 2 } },
      NOW,
    )
    expect('brand' in bare).toBe(false)
  })

  it('createFood valide les bornes', async () => {
    await rejects(createFood({ ...input, name: ' ' }), /nom/)
    await rejects(createFood({ ...input, per100g: { ...input.per100g, kcal: 901 } }), /calories/)
    await rejects(createFood({ ...input, per100g: { ...input.per100g, protein: 101 } }), /Protéines/)
    await rejects(createFood({ ...input, per100g: { ...input.per100g, fat: -1 } }), /Protéines/)
    await rejects(createFood({ ...input, per100g: { ...input.per100g, fiber: Number.NaN } }), /Protéines/)
    await rejects(createFood({ ...input, defaultPortionG: 0 }), /portion/)
    expect(await db.foods.count()).toBe(0)
  })

  it('updateFood met à jour un aliment perso, garde favori, id et source', async () => {
    const f = await setFoodFavorite(await createFood(input, NOW), true, NOW)
    const next = await updateFood(f, { ...input, name: 'Skyr nature', brand: undefined }, T1)
    expect(next).toMatchObject({
      id: f.id,
      name: 'Skyr nature',
      favorite: true,
      source: 'user',
      updatedAt: T1,
    })
    expect('brand' in next).toBe(false)
    expect(await getFoodRow(f.id)).toEqual(next)
  })

  it('updateFood sans changement n’écrit rien', async () => {
    const f = await createFood(input, NOW)
    const same = await updateFood(f, { name: 'Skyr', brand: 'Danone', per100g: { ...input.per100g } }, T1)
    expect(same).toBe(f)
    expect((await getFoodRow(f.id))?.updatedAt).toBe(NOW)
    // Aliment Ciqual sans modification : pas de surcharge créée
    await updateFood(riceFood, { name: riceFood.name, per100g: { ...riceFood.per100g } }, T1)
    expect(await db.foods.count()).toBe(1)
  })

  it('updateFood d’un aliment perso supprimé entre-temps est refusé', async () => {
    const f = await createFood(input, NOW)
    await deleteFood(f)
    await rejects(updateFood(f, { ...input, name: 'Autre' }, T1), /introuvable/)
  })

  it('updateFood sur un aliment Ciqual écrit puis met à jour la surcharge', async () => {
    const over = await updateFood(
      riceFood,
      { name: 'Riz basmati', per100g: { kcal: 140, protein: 3, carbs: 29, fat: 0.4 } },
      T1,
    )
    expect(over).toMatchObject({
      id: rice.id,
      source: 'ciqual',
      ciqualCode: '9100',
      name: 'Riz basmati',
      favorite: false,
    })
    const again = await updateFood(
      over,
      { name: 'Riz basmati', per100g: { kcal: 145, protein: 3, carbs: 29, fat: 0.4 } },
      T2,
    )
    expect(again.per100g.kcal).toBe(145)
    expect(await db.foods.count()).toBe(1)
  })

  it('setFoodFavorite crée la surcharge Ciqual (copie complète) puis restoreCiqualFood la supprime', async () => {
    const fav = await setFoodFavorite(riceFood, true, T1)
    expect(fav).toEqual({ ...riceFood, favorite: true, updatedAt: T1 })
    expect(await getFoodRow(rice.id)).toEqual(fav)
    const unfav = await setFoodFavorite(fav, false, T2)
    expect(unfav.favorite).toBe(false)
    expect(unfav.updatedAt).toBe(T2)
    await restoreCiqualFood(rice.id)
    expect(await getFoodRow(rice.id)).toBeUndefined()
    await restoreCiqualFood(rice.id)
  })

  it('setFoodFavorite(false) sans surcharge n’écrit rien ; aliment inconnu refusé', async () => {
    expect(await setFoodFavorite(riceFood, false, T1)).toBe(riceFood)
    expect(await db.foods.count()).toBe(0)
    await rejects(setFoodFavorite({ ...riceFood, source: 'user', id: 'ghost' }, true, T1), /introuvable/)
  })

  it('setFoodFavorite sur un aliment perso déjà au bon état ne réécrit pas', async () => {
    const f = await setFoodFavorite(await createFood(input, NOW), true, T1)
    const again = await setFoodFavorite(f, true, T2)
    expect(again.updatedAt).toBe(T1)
  })

  it('restoreCiqualFood ne touche pas un aliment perso', async () => {
    const f = await createFood(input, NOW)
    await restoreCiqualFood(f.id)
    expect(await getFoodRow(f.id)).toBeDefined()
  })

  it('deleteFood supprime un aliment perso, garde les macros figées du journal, refuse Ciqual', async () => {
    const f = await createFood(input, NOW)
    await addLogEntries([entry('l1', '2026-03-01', { origin: { kind: 'food', foodId: f.id, grams: 100 } })])
    await deleteFood(f)
    expect(await getFoodRow(f.id)).toBeUndefined()
    expect((await listLogForDate('2026-03-01'))[0]?.macros.kcal).toBe(195)
    await rejects(deleteFood(riceFood), /Ciqual/)
  })
})

describe('journal', () => {
  it('addLogEntries / listLogForDate / listLogBetween (bornes incluses)', async () => {
    await addLogEntries([
      entry('a', '2026-02-28', { createdAt: T2 }),
      entry('b', '2026-03-01', { createdAt: T2 }),
      entry('c', '2026-03-01', { createdAt: T1 }),
      entry('d', '2026-03-02'),
      entry('e', '2026-03-03'),
    ])
    expect((await listLogForDate('2026-03-01')).map((e) => e.id)).toEqual(['c', 'b'])
    expect((await listLogBetween('2026-03-01', '2026-03-02')).map((e) => e.id)).toEqual(['c', 'b', 'd'])
    expect(await listLogBetween('2026-04-01', '2026-04-02')).toEqual([])
    expect(await listLogForDate('2030-01-01')).toEqual([])
  })

  it('addLogEntries : tout ou rien, nom trimé, macros inchangées', async () => {
    const rows = await addLogEntries([entry('a', '2026-03-01', { name: ' Riz ' })])
    expect(rows[0]?.name).toBe('Riz')
    expect(rows[0]?.macros).toEqual({ kcal: 195, protein: 4.05, carbs: 42, fat: 0.45 })
    await rejects(addLogEntries([entry('b'), entry('c', '2026-03-01', { name: '' })]), /nom/)
    expect(await db.foodLog.count()).toBe(1)
    await rejects(addLogEntries([entry('a')]), /existe déjà/)
    await rejects(addLogEntries([entry('x'), entry('x')]), /double/)
    expect(await addLogEntries([])).toEqual([])
    expect(await db.foodLog.count()).toBe(1)
  })

  it('updateLogEntry remplace l’entrée en gardant createdAt ; refuse l’absente', async () => {
    await addLogEntries([entry('a')])
    const next = await updateLogEntry(
      entry('a', '2026-03-01', {
        origin: { kind: 'food', foodId: rice.id, grams: 200 },
        macros: { kcal: 260, protein: 5.4, carbs: 56, fat: 0.6 },
        createdAt: T2,
      }),
    )
    expect(next.createdAt).toBe(NOW)
    expect((await listLogForDate('2026-03-01'))[0]?.macros.kcal).toBe(260)
    await rejects(updateLogEntry(entry('ghost')), /introuvable/)
    await rejects(
      updateLogEntry(entry('a', '2026-03-01', { origin: { kind: 'food', foodId: 'x', grams: 0 } })),
      /quantité/,
    )
  })

  it('deleteLogEntry', async () => {
    await addLogEntries([entry('a'), entry('b')])
    await deleteLogEntry('a')
    await deleteLogEntry('zzz')
    expect((await listLogForDate('2026-03-01')).map((e) => e.id)).toEqual(['b'])
  })

  it('checkLogEntry : bornes par origine', () => {
    expect(checkLogEntry(entry('a'))).toBeNull()
    expect(
      checkLogEntry(entry('a', '2026-03-01', { macros: { kcal: -1, protein: 0, carbs: 0, fat: 0 } })),
    ).toMatch(/macros/)
    expect(
      checkLogEntry(entry('a', '2026-03-01', { macros: { kcal: Infinity, protein: 0, carbs: 0, fat: 0 } })),
    ).toMatch(/macros/)
    expect(
      checkLogEntry(entry('a', '2026-03-01', { origin: { kind: 'recipe', recipeId: 'r', portions: 0 } })),
    ).toMatch(/portions/)
    expect(
      checkLogEntry(
        entry('a', '2026-03-01', {
          origin: { kind: 'free' },
          macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        }),
      ),
    ).toBeNull()
    expect(checkLogEntry(entry('a', '2026-02-30'))).toMatch(/Date/)
  })
})

describe('objectifs', () => {
  it('updateNutritionParams fusionne et valide les bornes', async () => {
    await saveProfile(makeProfile(), NOW)
    const p = await updateNutritionParams({ surplus: 0.15, proteinPerKg: 2 }, T1)
    expect(p.nutrition).toMatchObject({ surplus: 0.15, proteinPerKg: 2, fatShare: 0.27, kcalAdjustment: 0 })
    expect(p.updatedAt).toBe(T1)
    await rejects(updateNutritionParams({ surplus: 0.04 }, T2), /surplus/)
    await rejects(updateNutritionParams({ surplus: 0.21 }, T2))
    await rejects(updateNutritionParams({ proteinPerKg: 1.5 }, T2), /protéines/i)
    await rejects(updateNutritionParams({ proteinPerKg: 2.3 }, T2))
    await rejects(updateNutritionParams({ fatShare: 0.19 }, T2), /lipides/)
    await rejects(updateNutritionParams({ fatShare: 0.36 }, T2))
    await rejects(updateNutritionParams({ kcalAdjustment: 1001 }, T2), /ajustement/i)
    await rejects(updateNutritionParams({ kcalAdjustment: -1001 }, T2))
    await updateNutritionParams(
      { surplus: 0.05, proteinPerKg: 1.6, fatShare: 0.2, kcalAdjustment: -1000 },
      T2,
    )
    await updateNutritionParams({ surplus: 0.2, proteinPerKg: 2.2, fatShare: 0.35, kcalAdjustment: 1000 }, T2)
    expect((await db.profile.get('me'))?.nutrition.kcalAdjustment).toBe(1000)
  })

  it('updateNutritionParams ignore les valeurs undefined et exige un profil', async () => {
    await rejects(updateNutritionParams({ surplus: 0.1 }, T1), /Profil/)
    await saveProfile(makeProfile(), NOW)
    const p = await updateNutritionParams({ surplus: undefined, kcalAdjustment: 100 }, T1)
    expect(p.nutrition.surplus).toBe(0.12)
    await rejects(updateNutritionParams({ kcalAdjustedOn: '2026-02-30' }, T1))
  })

  it('acceptKcalSuggestion cumule l’ajustement et date', async () => {
    await saveProfile(makeProfile(), NOW)
    await acceptKcalSuggestion(150, '2026-03-01', T1)
    const p = await acceptKcalSuggestion(150, '2026-03-25', T2)
    expect(p.nutrition.kcalAdjustment).toBe(300)
    expect(p.nutrition.kcalAdjustedOn).toBe('2026-03-25')
    await db.profile.put(makeProfile({ nutrition: { ...p.nutrition, kcalAdjustment: 950 } }))
    await rejects(acceptKcalSuggestion(100, '2026-04-01', T2), /ajustement/i)
    expect((await db.profile.get('me'))?.nutrition.kcalAdjustment).toBe(950)
    await rejects(acceptKcalSuggestion(Number.NaN, '2026-04-01', T2))
  })

  it('acceptKcalSuggestion exige un profil', async () => {
    await rejects(acceptKcalSuggestion(150, '2026-03-01', T1), /Profil/)
  })

  it('checkLogEntry : bornes hautes', () => {
    const m = (kcal: number, protein = 0) => ({ kcal, protein, carbs: 0, fat: 0 })
    expect(checkLogEntry(entry('a', '2026-03-01', { macros: m(10001) }))).toMatch(/dépasser/)
    expect(checkLogEntry(entry('a', '2026-03-01', { macros: m(10000, 1001) }))).toMatch(/dépasser/)
    expect(checkLogEntry(entry('a', '2026-03-01', { name: 'x'.repeat(121) }))).toMatch(/120/)
    expect(
      checkLogEntry(entry('a', '2026-03-01', { origin: { kind: 'recipe', recipeId: 'r', portions: 51 } })),
    ).toMatch(/portions/)
    expect(
      checkLogEntry(entry('a', '2026-03-01', { origin: { kind: 'food', foodId: 'x', grams: 5001 } })),
    ).toMatch(/quantité/)
    expect(
      checkLogEntry(
        entry('a', '2026-03-01', {
          macros: m(10000, 1000),
          origin: { kind: 'food', foodId: 'x', grams: 5000 },
        }),
      ),
    ).toBeNull()
  })

  it('checkNutritionParams / checkFoodInput purs', () => {
    expect(
      checkNutritionParams({ surplus: 0.12, proteinPerKg: 1.8, fatShare: 0.27, kcalAdjustment: 0 }),
    ).toBeNull()
    expect(checkFoodInput({ name: 'x', per100g: { kcal: 900, protein: 100, carbs: 0, fat: 0 } })).toBeNull()
    expect(
      checkFoodInput({ name: 'x'.repeat(81), per100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 } }),
    ).toMatch(/80/)
  })
})
