import { beforeEach, describe, expect, it } from 'vitest'
import type { FoodLogEntry, FridgeItem, LibraryRecipe, Recipe, RecipeInput, ShoppingList } from '../types'
import { db } from './database'
import { parseBackup, exportBackup, importBackup, migrateBackup } from './backup'
import { shoppingKey } from '../domain/nutrition/shopping'
import {
  commitImport,
  createRecipe,
  deleteFridgeItem,
  deleteRecipe,
  deleteShoppingList,
  getRecipeRow,
  getShoppingList,
  listFridge,
  listRecipeRows,
  listShoppingLists,
  logRecipeEntries,
  prepareFridge,
  restoreRecipe,
  saveShoppingList,
  setRecipeFavorite,
  setShoppingItemChecked,
  undoRecipeEntries,
  updateFridgeItem,
  updateRecipe,
} from './recipes'
import { deleteLogEntry, listLogForDate } from './nutrition'
import { ValidationError } from './repositories'
import { validateFridgeItem, validateRecipeInput } from './validation'
import { NOW } from './testFixtures'
import { SEED_RECIPES } from '../content/recipes'

const T1 = '2026-03-02T09:00:00.000Z'
const T2 = '2026-03-03T09:00:00.000Z'

const rejects = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(ValidationError)

const input: RecipeInput = {
  name: ' Porridge ',
  meal: ['breakfast'],
  servings: 2,
  prepMinutes: 5,
  cookMinutes: 5,
  fridgeDays: 3,
  tags: [' rapide ', ''],
  ingredients: [
    { name: ' Flocons d’avoine ', grams: 100, aisle: 'grocery', ciqualCode: '1' },
    { name: 'Lait', grams: 300, aisle: 'dairy', per100g: { kcal: 46, protein: 3.2, carbs: 4.8, fat: 1 } },
  ],
  steps: [' Chauffer ', 'Servir'],
}

const seed: LibraryRecipe = {
  ...input,
  name: 'Omelette',
  id: 'omelette',
  tags: [],
  steps: ['Chauffer', 'Servir'],
  ingredients: [{ name: 'Oeuf', grams: 120, aisle: 'dairy' }],
  source: 'seed',
  overridden: false,
  updatedAt: NOW,
}

function logEntry(id: string, fridgeItemId: string | undefined, portions: number): FoodLogEntry {
  return {
    id,
    date: '2026-03-02',
    slot: 'lunch',
    name: 'Porridge',
    origin: { kind: 'recipe', recipeId: 'r', portions, ...(fridgeItemId ? { fridgeItemId } : {}) },
    macros: { kcal: 300, protein: 12, carbs: 40, fat: 8 },
    createdAt: NOW,
  }
}

const fridgeItem = (id: string, recipeId = 'r', portionsLeft = 4): FridgeItem => ({
  id,
  recipeId,
  portionsLeft,
  preparedOn: '2026-03-01',
  expiresOn: '2026-03-04',
})

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('validation recettes / frigo', () => {
  it('validateRecipeInput accepte une recette correcte', () => {
    expect(validateRecipeInput(input)).toBeNull()
  })
  it.each<[string, Partial<RecipeInput>]>([
    ['nom vide', { name: '  ' }],
    ['nom trop long', { name: 'x'.repeat(121) }],
    ['repas vide', { meal: [] }],
    ['portions 0', { servings: 0 }],
    ['portions 51', { servings: 51 }],
    ['portions décimales', { servings: 1.5 }],
    ['prépa 601', { prepMinutes: 601 }],
    ['cuisson négative', { cookMinutes: -1 }],
    ['frigo 0 jour', { fridgeDays: 0 }],
    ['frigo 15 jours', { fridgeDays: 15 }],
    ['sans ingrédient', { ingredients: [] }],
    ['grammes 0', { ingredients: [{ name: 'a', grams: 0, aisle: 'other' }] }],
    ['grammes 10001', { ingredients: [{ name: 'a', grams: 10001, aisle: 'other' }] }],
    ['ingrédient sans nom', { ingredients: [{ name: ' ', grams: 5, aisle: 'other' }] }],
    ['sans étape', { steps: [] }],
    ['étape vide', { steps: ['ok', ' '] }],
  ])('validateRecipeInput refuse : %s', (_label, patch) => {
    expect(validateRecipeInput({ ...input, ...patch })).toEqual(expect.any(String))
  })
  it('validateFridgeItem', () => {
    expect(validateFridgeItem(fridgeItem('f'))).toBeNull()
    expect(validateFridgeItem({ ...fridgeItem('f'), portionsLeft: 0 })).not.toBeNull()
    expect(validateFridgeItem({ ...fridgeItem('f'), expiresOn: '2026-02-01' })).not.toBeNull()
    expect(validateFridgeItem({ ...fridgeItem('f'), preparedOn: '2026-13-01' })).not.toBeNull()
  })
})

describe('recettes', () => {
  it('createRecipe : UUID, source user, champs nettoyés', async () => {
    const r = await createRecipe(input, T1)
    expect(r.source).toBe('user')
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(r.name).toBe('Porridge')
    expect(r.tags).toEqual(['rapide'])
    expect(r.steps).toEqual(['Chauffer', 'Servir'])
    expect(r.ingredients[0]?.name).toBe('Flocons d’avoine')
    expect(await getRecipeRow(r.id)).toEqual(r)
    expect(await listRecipeRows()).toEqual([r])
    await rejects(createRecipe({ ...input, steps: [] }))
  })

  it('updateRecipe : recette user mise à jour, favori conservé, sans changement rien écrit', async () => {
    const r = await createRecipe(input, T1)
    await setRecipeFavorite(r, true, T1)
    const same = await updateRecipe((await getRecipeRow(r.id)) as Recipe, input, T2)
    expect(same.updatedAt).toBe(T1)
    const next = await updateRecipe((await getRecipeRow(r.id)) as Recipe, { ...input, servings: 4 }, T2)
    expect(next).toMatchObject({ servings: 4, favorite: true, source: 'user', updatedAt: T2 })
    await rejects(updateRecipe(r, { ...input, name: '' }))
  })

  it('updateRecipe : recette user inexistante -> erreur', async () => {
    const r = await createRecipe(input, T1)
    await deleteRecipe(r)
    await rejects(updateRecipe(r, { ...input, servings: 3 }))
  })

  it('updateRecipe : recette seed -> surcharge de même id ; identique -> rien', async () => {
    const same = await updateRecipe(seed, { ...seed, name: 'Omelette' }, T1)
    expect(same).toBe(seed)
    expect(await db.recipes.count()).toBe(0)
    const row = await updateRecipe(seed, { ...seed, servings: 3 }, T1)
    expect(row).toMatchObject({ id: 'omelette', source: 'seed', servings: 3 })
    expect('overridden' in row).toBe(false)
    expect(await db.recipes.count()).toBe(1)
  })

  it('setRecipeFavorite : seed sans surcharge -> surcharge complète ; idempotent', async () => {
    expect(await setRecipeFavorite(seed, false, T1)).toBe(seed)
    expect(await db.recipes.count()).toBe(0)
    const row = await setRecipeFavorite(seed, true, T1)
    expect(row).toMatchObject({ id: 'omelette', source: 'seed', favorite: true, name: 'Omelette' })
    const off = await setRecipeFavorite(row, false, T2)
    expect(off.favorite).toBe(false)
    await rejects(setRecipeFavorite({ ...seed, source: 'user', id: 'ghost' }, true))
  })

  it('deleteRecipe seed : surcharge deleted ; restoreRecipe la retire', async () => {
    await deleteRecipe(seed, T1)
    expect(await getRecipeRow('omelette')).toMatchObject({ source: 'seed', deleted: true })
    await restoreRecipe('omelette')
    expect(await getRecipeRow('omelette')).toBeUndefined()
  })

  it('restoreRecipe ne touche pas une recette user', async () => {
    const r = await createRecipe(input, T1)
    await restoreRecipe(r.id)
    expect(await getRecipeRow(r.id)).toBeDefined()
  })

  it('deleteRecipe user : supprime la ligne et le frigo, garde le journal', async () => {
    const r = await createRecipe(input, T1)
    await prepareFridge(fridgeItem('f1', r.id))
    await prepareFridge(fridgeItem('f2', 'autre'))
    await logRecipeEntries([
      { ...logEntry('e1', undefined, 1), origin: { kind: 'recipe', recipeId: r.id, portions: 1 } },
    ])
    await deleteRecipe(r)
    expect(await getRecipeRow(r.id)).toBeUndefined()
    expect((await listFridge()).map((f) => f.id)).toEqual(['f2'])
    expect((await listLogForDate('2026-03-02'))[0]?.name).toBe('Porridge')
  })
})

describe('frigo', () => {
  it('prepareFridge valide et ajoute', async () => {
    expect(await prepareFridge(fridgeItem('f1'))).toEqual(fridgeItem('f1'))
    expect(await listFridge()).toEqual([fridgeItem('f1')])
    await rejects(prepareFridge({ ...fridgeItem('f2'), expiresOn: '2026-01-01' }))
    await rejects(prepareFridge({ ...fridgeItem('f3'), portionsLeft: 0 }))
  })

  it('updateFridgeItem : modifie, 0 supprime, inconnu -> erreur', async () => {
    await prepareFridge(fridgeItem('f1'))
    expect(await updateFridgeItem('f1', { portionsLeft: 2, expiresOn: '2026-03-06' })).toMatchObject({
      portionsLeft: 2,
      expiresOn: '2026-03-06',
    })
    await rejects(updateFridgeItem('f1', { expiresOn: '2026-02-01' }))
    expect(await updateFridgeItem('f1', { portionsLeft: 0 })).toBeUndefined()
    expect(await listFridge()).toEqual([])
    await rejects(updateFridgeItem('f1', { portionsLeft: 1 }))
  })

  it('deleteFridgeItem', async () => {
    await prepareFridge(fridgeItem('f1'))
    await deleteFridgeItem('f1')
    expect(await listFridge()).toEqual([])
  })
})

describe('logRecipeEntries', () => {
  it('ajoute au journal et décrémente le frigo', async () => {
    await prepareFridge(fridgeItem('f1', 'r', 4))
    await logRecipeEntries([logEntry('e1', 'f1', 1)])
    expect((await listFridge())[0]?.portionsLeft).toBe(3)
    expect(await listLogForDate('2026-03-02')).toHaveLength(1)
  })

  it('sans fridgeItemId, ne touche pas au frigo', async () => {
    await prepareFridge(fridgeItem('f1', 'r', 4))
    await logRecipeEntries([logEntry('e1', undefined, 1)])
    expect((await listFridge())[0]?.portionsLeft).toBe(4)
  })

  it('à 0 ou en dessous : ligne supprimée, jamais négatif', async () => {
    await prepareFridge(fridgeItem('f1', 'r', 2))
    await logRecipeEntries([logEntry('e1', 'f1', 1), logEntry('e2', 'f1', 3)])
    expect(await listFridge()).toEqual([])
    expect(await db.foodLog.count()).toBe(2)
  })

  it('fridgeItemId introuvable : erreur et rien d’écrit', async () => {
    await prepareFridge(fridgeItem('f1', 'r', 4))
    await rejects(logRecipeEntries([logEntry('e1', 'f1', 1), logEntry('e2', 'absent', 1)]))
    expect(await db.foodLog.count()).toBe(0)
    expect((await listFridge())[0]?.portionsLeft).toBe(4)
  })

  it('entrée invalide : rien d’écrit ; supprimer l’entrée ne réincrémente pas le frigo', async () => {
    await prepareFridge(fridgeItem('f1', 'r', 4))
    await rejects(logRecipeEntries([{ ...logEntry('e1', 'f1', 1), name: ' ' }]))
    expect((await listFridge())[0]?.portionsLeft).toBe(4)
    await logRecipeEntries([logEntry('e2', 'f1', 1)])
    await deleteLogEntry('e2')
    expect((await listFridge())[0]?.portionsLeft).toBe(3)
  })
})

describe('listes de courses', () => {
  const list: ShoppingList = {
    id: 'l1',
    name: 'Semaine',
    sources: [{ recipeId: 'r', portions: 2 }],
    items: [
      { id: 'i1', key: 'name:riz', name: 'Riz', grams: 300, aisle: 'grocery', checked: false },
      { id: 'i2', key: 'manual:x', name: 'Café', grams: 0, aisle: 'grocery', checked: false, manual: true },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  }

  it('saveShoppingList : put, updatedAt mis à jour, createdAt conservé', async () => {
    const saved = await saveShoppingList(list, T1)
    expect(saved.updatedAt).toBe(T1)
    const again = await saveShoppingList({ ...list, createdAt: T2, name: ' Autre ' }, T2)
    expect(again).toMatchObject({ name: 'Autre', createdAt: NOW, updatedAt: T2 })
    expect(await listShoppingLists()).toHaveLength(1)
    expect(await getShoppingList('l1')).toEqual(again)
    await rejects(saveShoppingList({ ...list, name: '' }))
    await rejects(
      saveShoppingList({
        ...list,
        items: [{ ...(list.items[0] as ShoppingList['items'][number]), grams: -1 }],
      }),
    )
  })

  it('setShoppingItemChecked et deleteShoppingList', async () => {
    await saveShoppingList(list, T1)
    const next = await setShoppingItemChecked('l1', 'i1', true, T2)
    expect(next.items.map((i) => i.checked)).toEqual([true, false])
    expect((await getShoppingList('l1'))?.updatedAt).toBe(T2)
    await rejects(setShoppingItemChecked('l1', 'zz', true))
    await rejects(setShoppingItemChecked('nope', 'i1', true))
    await deleteShoppingList('l1')
    expect(await getShoppingList('l1')).toBeUndefined()
  })
})

describe('commitImport', () => {
  const meal: FoodLogEntry = {
    ...logEntry('m1', undefined, 1),
    origin: { kind: 'import', estimated: true },
    name: 'Burger',
  }

  it('crée recettes et entrées', async () => {
    const out = await commitImport([input, { ...input, name: 'B' }], [meal], T1)
    expect(out).toMatchObject({ recipesCreated: 2, mealsLogged: 1 })
    expect(out.entries).toHaveLength(1)
    expect(await db.recipes.count()).toBe(2)
    expect(await db.foodLog.count()).toBe(1)
  })

  it('une recette invalide annule tout', async () => {
    await rejects(commitImport([input, { ...input, steps: [] }], [meal], T1))
    expect(await db.recipes.count()).toBe(0)
    expect(await db.foodLog.count()).toBe(0)
  })

  it('une entrée invalide annule tout (recettes comprises)', async () => {
    await rejects(commitImport([input], [{ ...meal, name: '' }], T1))
    expect(await db.recipes.count()).toBe(0)
  })
})

describe('sauvegarde : bornes métier J6', () => {
  it('round-trip puis refus d’une recette / frigo / liste hors bornes', async () => {
    const r = await createRecipe(input, T1)
    await prepareFridge(fridgeItem('f1', r.id))
    const backup = await exportBackup(T1)
    const ok = parseBackup(JSON.stringify(backup), '2026-03-02')
    expect(ok.ok).toBe(true)
    if (ok.ok) await importBackup(ok.backup, 'replace', T1)

    const bad = structuredClone(backup)
    bad.tables.recipes = bad.tables.recipes.map((x) => ({ ...x, servings: 0 }))
    bad.tables.fridge = bad.tables.fridge.map((x) => ({ ...x, portionsLeft: 0 }))
    const res = parseBackup(JSON.stringify(bad), '2026-03-02')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.length).toBe(2)
  })

  it('une surcharge de suppression de recette n’est pas rejouée contre les règles', async () => {
    await deleteRecipe({ ...seed, steps: [] }, T1)
    const res = parseBackup(JSON.stringify(await exportBackup(T1)), '2026-03-02')
    expect(res.ok).toBe(true)
  })
})

describe('revue : contenu, frigo, favori, clés de courses', () => {
  it('enregistrer sans changement une vraie recette de départ (Ciqual) n’écrit rien', async () => {
    const real = SEED_RECIPES.find((r) => r.ingredients.some((i) => i.ciqualCode !== undefined)) as Recipe
    const lib: LibraryRecipe = { ...real, overridden: false }
    // Ordre des clés différent de l'original : ne doit pas compter.
    const input: RecipeInput = {
      ...(real as RecipeInput),
      ingredients: real.ingredients.map(
        (i) => Object.fromEntries(Object.entries(i).reverse()) as Recipe['ingredients'][number],
      ),
    }
    expect(await updateRecipe(lib, input, T1)).toBe(lib)
    expect(await db.recipes.count()).toBe(0)
  })

  it('logRecipeEntries refuse un frigo d’une autre recette', async () => {
    await prepareFridge(fridgeItem('f1', 'autre', 4))
    await rejects(logRecipeEntries([logEntry('e1', 'f1', 1)]))
    expect(await db.foodLog.count()).toBe(0)
    expect((await listFridge())[0]?.portionsLeft).toBe(4)
  })

  it('restoreRecipe garde le favori d’une surcharge', async () => {
    const real = SEED_RECIPES[0] as Recipe
    await setRecipeFavorite(real, true, T1)
    await restoreRecipe(real.id, real, T2)
    expect(await getRecipeRow(real.id)).toMatchObject({ ...real, favorite: true, updatedAt: T2 })
    await setRecipeFavorite(real, false, T2)
    await restoreRecipe(real.id)
    expect(await getRecipeRow(real.id)).toBeUndefined()
  })

  it('restoreRecipe d’une surcharge supprimée + favorite : tout est retiré', async () => {
    const real = SEED_RECIPES[0] as Recipe
    await deleteRecipe({ ...real, favorite: true }, T1)
    await restoreRecipe(real.id)
    expect(await getRecipeRow(real.id)).toBeUndefined()
  })

  it('migrateBackup remplit la clé des articles de courses', () => {
    const raw = {
      app: 'forge',
      schemaVersion: 2,
      exportedAt: T1,
      tables: {
        shoppingLists: [
          {
            id: 'l',
            name: 'x',
            sources: [],
            createdAt: T1,
            updatedAt: T1,
            items: [
              { id: 'a', name: 'Riz  Basmati', grams: 1, aisle: 'grocery', checked: false },
              { id: 'b', name: 'Lait', grams: 1, aisle: 'dairy', checked: true, foodId: 'ciqual-1' },
              { id: 'c', name: 'Café', grams: 0, aisle: 'grocery', checked: false, manual: true },
              { id: 'd', key: 'name:deja', name: 'Sel', grams: 1, aisle: 'grocery', checked: false },
            ],
          },
        ],
      },
    }
    const out = migrateBackup(raw)
    const items = (out.tables.shoppingLists as { items: { key: string }[] }[])[0]?.items ?? []
    expect(items.map((i) => i.key)).toEqual([
      shoppingKey({ name: 'Riz  Basmati' }),
      'ciqual:1',
      'manual:c',
      'name:deja',
    ])
    expect(items[0]?.key.startsWith('name:')).toBe(true)
    const parsed = parseBackup(JSON.stringify(raw), '2026-03-02')
    expect(parsed.ok).toBe(true)
  })
})

describe('undoRecipeEntries', () => {
  it('supprime les entrées et restaure le frigo (y compris une ligne supprimée à 0)', async () => {
    await prepareFridge(fridgeItem('f1', 'r', 2))
    const before = await listFridge()
    const entries = [logEntry('e1', 'f1', 1), logEntry('e2', 'f1', 1)]
    await logRecipeEntries(entries)
    expect(await listFridge()).toEqual([])
    await undoRecipeEntries(entries, before)
    expect(await listFridge()).toEqual(before)
    expect(await db.foodLog.count()).toBe(0)
  })

  it('idempotent, plafonné à l’instantané, ignore les entrées sans frigo', async () => {
    await prepareFridge(fridgeItem('f1', 'r', 4))
    const before = await listFridge()
    const entries = [logEntry('e1', 'f1', 1), logEntry('e2', undefined, 1)]
    await logRecipeEntries(entries)
    await undoRecipeEntries(entries, before)
    await undoRecipeEntries(entries, before)
    expect((await listFridge())[0]?.portionsLeft).toBe(4)
    expect(await db.foodLog.count()).toBe(0)
  })
})
