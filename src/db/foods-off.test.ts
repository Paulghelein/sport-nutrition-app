import { beforeEach, describe, expect, it } from 'vitest'
import type { Food } from '../types'
import { db } from './database'
import { cacheOffFood, findFoodByEan } from './foods-off'
import { createFood, getFoodRow, setFoodFavorite, updateFood } from './nutrition'
import { ValidationError } from './repositories'
import { checkFoodInput } from './validation'
import { NOW } from './testFixtures'

const EAN = '3017620422003'
const off = (overrides: Partial<Food> = {}): Food => ({
  id: `off-${EAN}`,
  name: 'Pâte à tartiner',
  source: 'off',
  ean: EAN,
  brand: 'Nutella',
  per100g: { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9 },
  favorite: false,
  updatedAt: NOW,
  ...overrides,
})
const per100g = { kcal: 60, protein: 10, carbs: 4, fat: 0.2 }

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('ean dans les aliments', () => {
  it('createFood enregistre l’ean (trimé) ; invalide refusé', async () => {
    const f = await createFood({ name: 'Skyr', ean: ` ${EAN} `, per100g })
    expect(f.ean).toBe(EAN)
    expect((await getFoodRow(f.id))?.ean).toBe(EAN)
    await expect(createFood({ name: 'x', ean: '123', per100g })).rejects.toBeInstanceOf(ValidationError)
    await expect(createFood({ name: 'x', ean: 'abcdefgh', per100g })).rejects.toBeInstanceOf(ValidationError)
    for (const ean of ['12345678', '123456789012', EAN]) {
      expect(checkFoodInput({ name: 'x', ean, per100g })).toBeNull()
    }
  })

  it('updateFood : ean absent = conservé, chaîne vide = effacé, modifié = écrit', async () => {
    const f = await createFood({ name: 'Skyr', ean: EAN, per100g }, NOW)
    const kept = await updateFood(f, { name: 'Skyr', per100g }, '2026-03-02T00:00:00.000Z')
    expect(kept).toBe(f)
    const cleared = await updateFood(f, { name: 'Skyr', ean: '', per100g }, '2026-03-02T00:00:00.000Z')
    expect(cleared.ean).toBeUndefined()
    const other = await updateFood(cleared, { name: 'Skyr', ean: '12345678', per100g })
    expect(other.ean).toBe('12345678')
  })
})

describe('findFoodByEan / cacheOffFood', () => {
  it('cache puis retrouve', async () => {
    expect(await findFoodByEan(EAN)).toBeUndefined()
    expect(await cacheOffFood(off())).toEqual(off())
    expect(await findFoodByEan(EAN)).toEqual(off())
  })

  it('plusieurs lignes : la plus récente', async () => {
    await db.foods.bulkPut([off(), off({ id: 'u', source: 'user', updatedAt: '2026-04-01T00:00:00.000Z' })])
    expect((await findFoodByEan(EAN))?.id).toBe('u')
  })

  it('ne remplace pas un aliment utilisateur de même ean', async () => {
    const mine = await createFood({ name: 'Mon produit', ean: EAN, per100g })
    expect(await cacheOffFood(off())).toEqual(mine)
    expect(await db.foods.count()).toBe(1)
  })

  it('rafraîchit une ligne OFF en gardant le favori', async () => {
    await cacheOffFood(off())
    await setFoodFavorite(off(), true)
    const next = await cacheOffFood(off({ name: 'Nouveau nom' }))
    expect(next).toMatchObject({ name: 'Nouveau nom', favorite: true })
    expect(await db.foods.count()).toBe(1)
  })

  it('refuse un Food incohérent', async () => {
    await expect(cacheOffFood(off({ id: 'x' }))).rejects.toBeInstanceOf(ValidationError)
    await expect(cacheOffFood(off({ source: 'user' }))).rejects.toBeInstanceOf(ValidationError)
    await expect(cacheOffFood(off({ ean: undefined }))).rejects.toBeInstanceOf(ValidationError)
    await expect(cacheOffFood(off({ per100g: { ...off().per100g, kcal: 5000 } }))).rejects.toBeInstanceOf(
      ValidationError,
    )
  })
})
