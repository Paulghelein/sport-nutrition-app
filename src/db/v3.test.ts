// Couche de données v3 : photos des produits (F6), recette + frigo (F4), nouveaux champs optionnels (F3, F4).
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupFile, Food, OffPhoto, PhotoMime, RecipeInput } from '../types'
import { exportBackup, importBackup, migrateBackup, parseBackup } from './backup'
import { db } from './database'
import {
  cacheOffFood,
  cacheOffFoodWithPhoto,
  deleteFoodPhoto,
  getFoodPhoto,
  getFoodPhotos,
  saveFoodPhoto,
} from './foods-off'
import { draftToRecipeInput } from '../domain/nutrition/scan'
import { createFood, deleteFood, restoreCiqualFood, updateFood } from './nutrition'
import { createRecipe, createRecipeWithFridge, listFridge, listRecipeRows } from './recipes'
import { ValidationError } from './repositories'
import { exerciseStateSchema, foodSchema, recipeSchema, sessionSchema, sessionTemplateSchema } from './schemas'
import { NOW, makeFullTables } from './testFixtures'
import { checkFoodInput, validateRecipeInput } from './validation'

const EAN = '3017620422003'
const PNG = [137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128, 7]
const photo = (bytes: number[] = PNG, mime: PhotoMime = 'image/png'): OffPhoto => ({
  mime,
  blob: new Blob([new Uint8Array(bytes)], { type: mime }),
})
const off = (over: Partial<Food> = {}): Food => ({
  id: `off-${EAN}`,
  name: 'Pâte à tartiner',
  source: 'off',
  ean: EAN,
  per100g: { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9 },
  favorite: false,
  updatedAt: NOW,
  ...over,
})
const bytesOf = (b: ArrayBuffer) => [...new Uint8Array(b)]
function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('valeur attendue')
  return v
}
const rejects = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(ValidationError)

// Le Blob de jsdom n'a pas toujours `arrayBuffer()` : on utilise celui de Node pour fabriquer les `OffPhoto` de test.
beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ 'node:buffer' as string)) as { Blob: typeof Blob }
  vi.stubGlobal('Blob', mod.Blob)
})

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('photos des aliments', () => {
  it('saveFoodPhoto / getFoodPhoto : aller-retour, remplacement', async () => {
    await cacheOffFood(off())
    const row = await saveFoodPhoto(`off-${EAN}`, photo(), NOW)
    expect(row).toMatchObject({ foodId: `off-${EAN}`, mime: 'image/png', fetchedAt: NOW })
    const got = await getFoodPhoto(`off-${EAN}`)
    expect(got?.mime).toBe('image/png')
    expect(bytesOf(must(got).bytes)).toEqual(PNG)
    await saveFoodPhoto(`off-${EAN}`, photo([1, 2, 3], 'image/jpeg'))
    expect(bytesOf(must(await getFoodPhoto(`off-${EAN}`)).bytes)).toEqual([1, 2, 3])
    expect(await db.foodPhotos.count()).toBe(1)
  })

  it('refuse un aliment inconnu, un mime non image, une photo vide ou trop lourde', async () => {
    await rejects(saveFoodPhoto('off-nope', photo()))
    await cacheOffFood(off())
    await rejects(saveFoodPhoto(`off-${EAN}`, photo(PNG, 'image/gif' as PhotoMime)))
    await rejects(saveFoodPhoto(`off-${EAN}`, photo([])))
    await rejects(saveFoodPhoto(`off-${EAN}`, photo(new Array<number>(300 * 1024 + 1).fill(1))))
    expect(await db.foodPhotos.count()).toBe(0)
  })

  it('getFoodPhotos : Map des aliments qui en ont une', async () => {
    const a = await createFood({ name: 'A', per100g: off().per100g })
    const b = await createFood({ name: 'B', per100g: off().per100g })
    await saveFoodPhoto(a.id, photo())
    const map = await getFoodPhotos([a.id, b.id, 'inconnu'])
    expect([...map.keys()]).toEqual([a.id])
    expect((await getFoodPhotos([])).size).toBe(0)
  })

  it('saveFoodPhoto refuse un aliment Ciqual ; restoreCiqualFood supprime la photo orpheline', async () => {
    const per100g = off().per100g
    const ciq: Food = { id: 'ciq-1', name: 'Pomme', source: 'ciqual', ciqualCode: '1', per100g, favorite: false, updatedAt: NOW }
    await db.foods.put(ciq)
    await rejects(saveFoodPhoto(ciq.id, photo()))
    await db.foodPhotos.put({ foodId: ciq.id, mime: 'image/png', bytes: new Uint8Array(PNG).buffer, fetchedAt: NOW })
    await restoreCiqualFood(ciq.id)
    expect(await db.foodPhotos.count()).toBe(0)
  })

  it('deleteFoodPhoto et deleteFood suppriment la photo', async () => {
    const a = await createFood({ name: 'A', per100g: off().per100g })
    await saveFoodPhoto(a.id, photo())
    await deleteFoodPhoto(a.id)
    expect(await getFoodPhoto(a.id)).toBeUndefined()
    await deleteFoodPhoto(a.id)
    await saveFoodPhoto(a.id, photo())
    await deleteFood(a)
    expect(await db.foodPhotos.count()).toBe(0)
  })

  it('cacheOffFoodWithPhoto écrit aliment + photo ; photo null garde la photo existante', async () => {
    const f = await cacheOffFoodWithPhoto(off(), photo(), NOW)
    expect(f.id).toBe(`off-${EAN}`)
    expect(bytesOf(must(await getFoodPhoto(f.id)).bytes)).toEqual(PNG)
    await cacheOffFoodWithPhoto(off({ name: 'Rafraîchi' }), null)
    expect((await db.foods.get(f.id))?.name).toBe('Rafraîchi')
    expect(await db.foodPhotos.count()).toBe(1)
    await cacheOffFoodWithPhoto(off(), photo([9, 9], 'image/webp'))
    expect((await getFoodPhoto(f.id))?.mime).toBe('image/webp')
  })

  it('cacheOffFoodWithPhoto : tout ou rien (produit invalide, photo invalide)', async () => {
    await rejects(cacheOffFoodWithPhoto(off({ id: 'x' }), photo()))
    await rejects(cacheOffFoodWithPhoto(off(), photo(PNG, 'text/html' as PhotoMime)))
    expect(await db.foods.count()).toBe(0)
    expect(await db.foodPhotos.count()).toBe(0)
  })

  it('aliment perso de même EAN : il gagne et reçoit la photo seulement s’il n’en a pas', async () => {
    const mine = await createFood({ name: 'Mon pâte', ean: EAN, per100g: off().per100g })
    const res = await cacheOffFoodWithPhoto(off(), photo(), NOW)
    expect(res.id).toBe(mine.id)
    expect(await db.foods.count()).toBe(1)
    expect(await db.foodPhotos.get(`off-${EAN}`)).toBeUndefined()
    expect(bytesOf(must(await getFoodPhoto(mine.id)).bytes)).toEqual(PNG)
    await cacheOffFoodWithPhoto(off(), photo([5, 5, 5]))
    expect(bytesOf(must(await getFoodPhoto(mine.id)).bytes)).toEqual(PNG)
  })
})

describe('sauvegarde v3 : photos', () => {
  async function seed() {
    const tables = makeFullTables()
    const food = off()
    await db.foods.bulkPut([...tables.foods, food])
    await saveFoodPhoto(food.id, photo(), NOW)
    return food
  }

  it('exporte les photos en base64 (schemaVersion 3), reprises à l’identique par un replace', async () => {
    const food = await seed()
    const backup = await exportBackup(NOW)
    expect(backup.schemaVersion).toBe(3)
    expect(backup.photos).toEqual([
      { foodId: food.id, mime: 'image/png', base64: btoa(String.fromCharCode(...PNG)), fetchedAt: NOW },
    ])
    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.photoCount).toBe(1)
    await db.foodPhotos.clear()
    await db.foods.clear()
    await importBackup(parsed.backup, 'replace', NOW)
    const back = await getFoodPhoto(food.id)
    expect(back?.mime).toBe('image/png')
    expect(bytesOf(must(back).bytes)).toEqual(PNG)
    expect(back?.fetchedAt).toBe(NOW)
  })

  it('stocke des ArrayBuffer (pas de Blob) ; l’export ignore les photos orphelines', async () => {
    const food = await seed()
    const stored = must(await db.foodPhotos.get(food.id))
    expect(Object.prototype.toString.call(stored.bytes)).toBe('[object ArrayBuffer]')
    expect('blob' in stored).toBe(false)
    await db.foodPhotos.put({ ...stored, foodId: 'off-disparu' })
    const backup = await exportBackup(NOW)
    expect(backup.photos?.map((p) => p.foodId)).toEqual([food.id])
  })

  it('replace vide les photos locales ; merge les conserve et remplace celles du fichier', async () => {
    const food = await seed()
    const other = await createFood({ name: 'Autre', per100g: food.per100g })
    await saveFoodPhoto(other.id, photo([4, 4]))
    const file = await exportBackup(NOW)
    // Le fichier ne contient que la photo de `food` (l'autre aliment n'est pas dans le fichier).
    file.tables.foods = file.tables.foods.filter((f) => f.id !== other.id)
    file.photos = must(file.photos).filter((p) => p.foodId === food.id)
    await saveFoodPhoto(food.id, photo([8, 8, 8]))
    await importBackup(file, 'merge', NOW)
    expect(bytesOf(must(await getFoodPhoto(food.id)).bytes)).toEqual(PNG)
    expect(await getFoodPhoto(other.id)).toBeDefined()
    await importBackup(file, 'replace', NOW)
    expect(await db.foodPhotos.count()).toBe(1)
    expect(await getFoodPhoto(other.id)).toBeUndefined()
  })

  it('replace avec un fichier v2 (sans photos) vide les photos ; merge n’y touche pas', async () => {
    const food = await seed()
    const v2: BackupFile = { app: 'forge', schemaVersion: 2, exportedAt: NOW, tables: makeFullTables() }
    await importBackup(v2, 'merge', NOW)
    expect(await db.foodPhotos.count()).toBe(1)
    await importBackup(v2, 'replace', NOW)
    expect(await db.foodPhotos.count()).toBe(0)
    expect(food.id).toBeDefined()
  })

  describe('validation à l’analyse', () => {
    const base = () => {
      const tables = makeFullTables()
      tables.foods = [off()]
      return { app: 'forge', schemaVersion: 3, exportedAt: NOW, tables }
    }
    const good = { foodId: `off-${EAN}`, mime: 'image/jpeg', base64: 'AQID', fetchedAt: NOW }
    const errors = (photos: unknown, schemaVersion = 3) => {
      const r = parseBackup(JSON.stringify({ ...base(), schemaVersion, photos }))
      return r.ok ? null : r.errors.join('\n')
    }

    it('accepte une photo valide, ou l’absence de photos', () => {
      expect(errors([good])).toBeNull()
      expect(errors([])).toBeNull()
      expect(parseBackup(JSON.stringify(base())).ok).toBe(true)
    })
    it('refuse mime, base64, taille, aliment absent, doublon, champ inconnu, v2 avec photos', () => {
      expect(errors([{ ...good, mime: 'image/gif' }])).toMatch(/Photos, ligne 1/)
      expect(errors([{ ...good, mime: 'text/html' }])).not.toBeNull()
      expect(errors([{ ...good, base64: 'pas du base64!' }])).not.toBeNull()
      expect(errors([{ ...good, base64: 'AQI' }])).not.toBeNull()
      expect(errors([{ ...good, base64: 'A'.repeat(4 * 110_000) }])).toMatch(/hors limites|300 ko|photo trop/)
      expect(errors([{ ...good, foodId: 'off-inconnu' }])).toMatch(/aucun aliment/)
      expect(errors([good, good])).toMatch(/double/)
      expect(errors([{ ...good, extra: 1 }])).not.toBeNull()
      expect(errors([{ ...good, fetchedAt: 'hier' }])).not.toBeNull()
      expect(errors('x')).toMatch(/photos/)
      expect(errors([good], 2)).toMatch(/photos/)
    })
    it('accepte exactement 300 ko décodés', () => {
      const base64 = 'A'.repeat((300 * 1024 * 4) / 3)
      expect(errors([{ ...good, base64 }])).toBeNull()
    })
  })

  it('migrateBackup accepte v1 et v2 sans photos (inchangé)', () => {
    for (const schemaVersion of [1, 2]) {
      const raw = { app: 'forge', schemaVersion, exportedAt: NOW, tables: {} }
      expect(migrateBackup(raw).photos).toBeUndefined()
      expect(parseBackup(JSON.stringify(raw)).ok).toBe(true)
    }
  })
})

describe('nouveaux champs optionnels (schémas et règles)', () => {
  const state = { exerciseId: 'e', loadKg: 10, recentFeelings: [], updatedAt: NOW }
  it('exerciseState : timedMaxBestReps entier 0–1000, timedMaxSec 10–600', () => {
    const ok = (extra: object) => exerciseStateSchema.safeParse({ ...state, ...extra }).success
    expect(ok({})).toBe(true)
    expect(ok({ timedMaxBestReps: 0, timedMaxSec: 10 })).toBe(true)
    expect(ok({ timedMaxBestReps: 1000, timedMaxSec: 600 })).toBe(true)
    expect(ok({ timedMaxBestReps: 1001 })).toBe(false)
    expect(ok({ timedMaxBestReps: -1 })).toBe(false)
    expect(ok({ timedMaxBestReps: 1.5 })).toBe(false)
    expect(ok({ timedMaxSec: 9 })).toBe(false)
    expect(ok({ timedMaxSec: 601 })).toBe(false)
  })

  it('setType dans les séries de séance et les blocs de modèle', () => {
    const tables = makeFullTables()
    const session = must(tables.sessions[0])
    const withSet = (setType: string) => ({
      ...session,
      blocks: [
        {
          id: 'b',
          kind: 'single',
          exercises: [{ exerciseId: 'e', restSec: 30, sets: [{ setType, targetReps: [5, 8] }] }],
        },
      ],
    })
    for (const t of ['reps', 'time', 'amrap', 'timedMax']) {
      expect(sessionSchema.safeParse(withSet(t)).success).toBe(true)
    }
    expect(sessionSchema.safeParse(withSet('max')).success).toBe(false)
    const tpl = tables.sessionTemplates[0]
    if (tpl) {
      const block = { exerciseId: 'e', sets: 3, restSec: 30, setType: 'timedMax', lastSetAmrap: true }
      expect(sessionTemplateSchema.safeParse({ ...tpl, blocks: [block] }).success).toBe(true)
      expect(sessionTemplateSchema.safeParse({ ...tpl, blocks: [{ ...block, setType: 'x' }] }).success).toBe(false)
    }
  })

  it('food.packageG : 0 < x ≤ 5000 (schéma et règle de saisie)', () => {
    const ok = (packageG: number) => foodSchema.safeParse({ ...off(), packageG }).success
    expect(ok(500)).toBe(true)
    expect(ok(5000)).toBe(true)
    expect(ok(0)).toBe(false)
    expect(ok(5001)).toBe(false)
    expect(checkFoodInput({ ...off(), packageG: 250 })).toBeNull()
    expect(checkFoodInput({ ...off(), packageG: 0 })).not.toBeNull()
    expect(checkFoodInput({ ...off(), packageG: 6000 })).not.toBeNull()
  })

  it('createFood / updateFood suivent packageG (création, modification, effacement, surcharge Ciqual)', async () => {
    const per100g = off().per100g
    const f = await createFood({ name: 'Skyr', per100g, packageG: 450 })
    expect(f.packageG).toBe(450)
    const same = await updateFood(f, { name: 'Skyr', per100g, packageG: 450 })
    expect(same).toBe(f)
    const changed = await updateFood(f, { name: 'Skyr', per100g, packageG: 500 }, NOW)
    expect(changed.packageG).toBe(500)
    const cleared = await updateFood(changed, { name: 'Skyr', per100g }, NOW)
    expect(cleared.packageG).toBeUndefined()
    expect((await db.foods.get(f.id))?.packageG).toBeUndefined()
    await rejects(updateFood(f, { name: 'Skyr', per100g, packageG: 0 }))
    const ciqual: Food = { id: 'ciq-1', name: 'Pomme', source: 'ciqual', ciqualCode: '1', per100g, favorite: false, updatedAt: NOW }
    expect((await updateFood(ciqual, { name: 'Pomme', per100g, packageG: 300 }, NOW)).packageG).toBe(300)
  })

  it('cacheOffFood accepte packageG et le persiste ; hors bornes refusé', async () => {
    await cacheOffFood(off({ packageG: 400 }))
    expect((await db.foods.get(`off-${EAN}`))?.packageG).toBe(400)
    await rejects(cacheOffFood(off({ packageG: 9999 })))
  })

  it('recipe.servingUnit : 1–24 caractères', () => {
    const row = {
      id: 'r',
      name: 'M',
      meal: ['snack'],
      servings: 4,
      prepMinutes: 5,
      cookMinutes: 5,
      tags: [],
      ingredients: [],
      steps: [],
      source: 'user',
      updatedAt: NOW,
    }
    expect(recipeSchema.safeParse({ ...row, servingUnit: 'muffins' }).success).toBe(true)
    expect(recipeSchema.safeParse({ ...row, servingUnit: '' }).success).toBe(false)
    expect(recipeSchema.safeParse({ ...row, servingUnit: 'x'.repeat(25) }).success).toBe(false)
    expect(recipeSchema.safeParse({ ...row, servingUnit: 'x'.repeat(24) }).success).toBe(true)
    expect(validateRecipeInput({ ...recipeInput(), servingUnit: '  ' })).toMatch(/unité/)
    expect(validateRecipeInput({ ...recipeInput(), servingUnit: 'x'.repeat(25) })).toMatch(/unité/)
    expect(validateRecipeInput({ ...recipeInput(), servingUnit: ' muffins ' })).toBeNull()
  })

  it('createRecipe trime et persiste servingUnit ; vide refusé', async () => {
    const r = await createRecipe({ ...recipeInput(), servingUnit: '  muffins ' }, NOW)
    expect(r.servingUnit).toBe('muffins')
    expect((await listRecipeRows())[0]?.servingUnit).toBe('muffins')
    await rejects(createRecipe({ ...recipeInput(), servingUnit: '   ' }, NOW))
  })

  it('une ancienne sauvegarde (sans nouveaux champs) reste valide', () => {
    const raw = { app: 'forge', schemaVersion: 1, exportedAt: NOW, tables: makeFullTables() }
    expect(parseBackup(JSON.stringify(raw)).ok).toBe(true)
  })
})

function recipeInput(over: Partial<RecipeInput> = {}): RecipeInput {
  return {
    name: 'Muffins protéinés',
    meal: ['snack'],
    servings: 6,
    prepMinutes: 10,
    cookMinutes: 20,
    tags: [],
    ingredients: [{ name: 'Flocons', grams: 200, aisle: 'grocery' }],
    steps: ['Mélanger', 'Cuire'],
    ...over,
  }
}

describe('createRecipeWithFridge (F4)', () => {
  it('crée la recette et une ligne de frigo (péremption par défaut 3 jours)', async () => {
    const { recipe, fridgeItem } = await createRecipeWithFridge(
      { recipe: recipeInput({ servingUnit: 'muffins' }), fridgePortions: 4, preparedOn: '2026-03-01' },
      NOW,
    )
    expect(recipe.source).toBe('user')
    expect(recipe.servingUnit).toBe('muffins')
    expect(fridgeItem).toMatchObject({
      recipeId: recipe.id,
      portionsLeft: 4,
      preparedOn: '2026-03-01',
      expiresOn: '2026-03-04',
    })
    expect(await listRecipeRows()).toEqual([recipe])
    expect(await listFridge()).toEqual([fridgeItem])
  })

  it('respecte fridgeDays de la recette', async () => {
    const { fridgeItem } = await createRecipeWithFridge(
      { recipe: recipeInput({ fridgeDays: 5 }), fridgePortions: 6, preparedOn: '2026-03-01' },
      NOW,
    )
    expect(fridgeItem?.expiresOn).toBe('2026-03-06')
  })

  it('fridgePortions = 0 : pas de ligne de frigo', async () => {
    const res = await createRecipeWithFridge(
      { recipe: recipeInput(), fridgePortions: 0, preparedOn: '2026-03-01' },
      NOW,
    )
    expect(res.fridgeItem).toBeUndefined()
    expect(await db.recipes.count()).toBe(1)
    expect(await db.fridge.count()).toBe(0)
  })

  it('refuse une recette invalide ou des portions incohérentes sans rien écrire', async () => {
    await rejects(
      createRecipeWithFridge({ recipe: recipeInput({ name: ' ' }), fridgePortions: 2, preparedOn: '2026-03-01' }),
    )
    await rejects(createRecipeWithFridge({ recipe: recipeInput(), fridgePortions: 7, preparedOn: '2026-03-01' }))
    await rejects(createRecipeWithFridge({ recipe: recipeInput(), fridgePortions: -1, preparedOn: '2026-03-01' }))
    await rejects(createRecipeWithFridge({ recipe: recipeInput(), fridgePortions: 1.5, preparedOn: '2026-03-01' }))
    await rejects(createRecipeWithFridge({ recipe: recipeInput(), fridgePortions: 2, preparedOn: 'demain' }))
    expect(await db.recipes.count()).toBe(0)
    expect(await db.fridge.count()).toBe(0)
  })

  it('transaction unique : si la ligne de frigo échoue à l’écriture, la recette n’est pas créée', async () => {
    const spy = vi.spyOn(db.fridge, 'add').mockRejectedValue(new Error('boom'))
    try {
      await expect(
        createRecipeWithFridge({ recipe: recipeInput(), fridgePortions: 2, preparedOn: '2026-03-01' }),
      ).rejects.toThrow('boom')
    } finally {
      spy.mockRestore()
    }
    expect(await db.recipes.count()).toBe(0)
  })

  it('accepte le résultat de draftToRecipeInput (brouillon type « muffins »)', async () => {
    const input = draftToRecipeInput({
      name: 'Muffins protéinés',
      servings: 6,
      servingUnit: 'muffins',
      meal: ['snack'],
      ingredients: [
        { key: 'a', name: 'Flocons d’avoine', grams: 200, origin: 'scan', foodId: `off-${EAN}`, aisle: 'grocery', packageG: 500 },
        { key: 'b', name: 'Pomme', grams: 150, origin: 'ciqual', ciqualCode: '13039', aisle: 'produce' },
      ],
    })
    const { recipe, fridgeItem } = await createRecipeWithFridge(
      { recipe: input, fridgePortions: 6, preparedOn: '2026-03-01' },
      NOW,
    )
    expect(recipe.servingUnit).toBe('muffins')
    expect(recipe.ingredients).toHaveLength(2)
    expect(fridgeItem?.portionsLeft).toBe(6)
  })
})
