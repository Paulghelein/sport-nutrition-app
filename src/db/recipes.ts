// Recettes (seed + surcharges), frigo, journal des recettes, listes de courses, import JSON (J6).
// Même principe que les exercices : la base ne stocke que les créations (`user`) et les surcharges (`seed`).
import type {
  FoodLogEntry,
  FridgeItem,
  Id,
  ImportOutcome,
  IsoDateTime,
  LibraryRecipe,
  Recipe,
  RecipeInput,
  RecipeWithFridgeInput,
  ShoppingList,
} from '../types'
import { fridgeItemFromPrep, recipeContentEquals, toRecipeInput } from '../domain/nutrition/recipes'
import { isValidLocalDate } from '../domain/shared/dates'
import { db } from './database'
import { fail, newId, nowIso } from './helpers'
import { addLogEntries } from './nutrition'
import { ValidationError } from './repositories'
import { fridgeItemSchema, recipeSchema, shoppingListSchema } from './schemas'
import { validateFridgeItem, validateRecipeInput, validateShoppingList } from './validation'

// ---------- Recettes ----------

export async function listRecipeRows(): Promise<Recipe[]> {
  return db.recipes.toArray()
}

export async function getRecipeRow(id: Id): Promise<Recipe | undefined> {
  return db.recipes.get(id)
}

/**
 * Ligne persistable : champs de `Recipe` seulement (`overridden` écarté), chaînes trimées, étiquettes vides retirées.
 * `validate: false` pour recopier une recette existante (suppression logique d'une recette de départ).
 */
function buildRecipeRow(
  id: Id,
  source: Recipe['source'],
  input: RecipeInput,
  now: IsoDateTime,
  favorite: boolean | undefined,
  validate = true,
): Recipe {
  const row: Recipe = {
    id,
    name: input.name.trim(),
    meal: [...input.meal],
    servings: input.servings,
    prepMinutes: input.prepMinutes,
    cookMinutes: input.cookMinutes,
    tags: input.tags.map((t) => t.trim()).filter((t) => t.length > 0),
    ingredients: input.ingredients.map((i) => {
      const out: Recipe['ingredients'][number] = { name: i.name.trim(), grams: i.grams, aisle: i.aisle }
      if (i.foodId !== undefined) out.foodId = i.foodId
      if (i.ciqualCode !== undefined) out.ciqualCode = i.ciqualCode
      if (i.per100g !== undefined) out.per100g = { ...i.per100g }
      return out
    }),
    steps: input.steps.map((s) => s.trim()),
    source,
    updatedAt: now,
  }
  if (input.fridgeDays !== undefined) row.fridgeDays = input.fridgeDays
  // Unité vide après trim : conservée telle quelle pour que la validation la refuse.
  if (input.servingUnit !== undefined) row.servingUnit = input.servingUnit.trim()
  if (favorite !== undefined) row.favorite = favorite
  if (validate) fail(validateRecipeInput(row))
  if (!recipeSchema.safeParse(row).success) {
    throw new ValidationError('Recette invalide : vérifie les champs saisis.')
  }
  return row
}

export async function createRecipe(input: RecipeInput, now: IsoDateTime = nowIso()): Promise<Recipe> {
  const row = buildRecipeRow(newId(), 'user', input, now, false)
  await db.recipes.add(row)
  return row
}

/**
 * F4 : recette personnelle + ligne de frigo (`fridgePortions` portions préparées le `preparedOn`, péremption
 * `fridgeDays ?? DEFAULT_FRIDGE_DAYS` via `fridgeItemFromPrep`) en UNE transaction : tout ou rien.
 * `fridgePortions` = 0 : pas de ligne de frigo ; il ne peut dépasser `servings`.
 */
export async function createRecipeWithFridge(
  input: RecipeWithFridgeInput,
  now: IsoDateTime = nowIso(),
): Promise<{ recipe: Recipe; fridgeItem?: FridgeItem }> {
  const portions = input.fridgePortions
  if (!Number.isInteger(portions) || portions < 0) {
    throw new ValidationError('Le nombre de portions au frigo doit être un entier positif ou nul.')
  }
  if (portions > input.recipe.servings) {
    throw new ValidationError('Le frigo ne peut pas contenir plus de portions que la recette.')
  }
  if (portions > 0 && !isValidLocalDate(input.preparedOn))
    throw new ValidationError('Date de préparation invalide.')
  const recipe = buildRecipeRow(newId(), 'user', input.recipe, now, false)
  const fridgeItem =
    portions > 0
      ? checkFridge(
          fridgeItemFromPrep(
            { recipeId: recipe.id, portions, preparedOn: input.preparedOn },
            recipe,
            newId(),
          ),
        )
      : undefined
  await db.transaction('rw', [db.recipes, db.fridge], async () => {
    await db.recipes.add(recipe)
    if (fridgeItem) await db.fridge.add(fridgeItem)
  })
  return fridgeItem ? { recipe, fridgeItem } : { recipe }
}

/**
 * Recette personnelle : met à jour la ligne. Recette de départ : écrit (ou remplace) la surcharge de même id.
 * Sans changement de contenu, n'écrit rien et renvoie `current`. Le favori est conservé.
 */
export async function updateRecipe(
  current: Recipe | LibraryRecipe,
  input: RecipeInput,
  now: IsoDateTime = nowIso(),
): Promise<Recipe> {
  return db.transaction('rw', db.recipes, async () => {
    const existing = await db.recipes.get(current.id)
    if (current.source === 'user' && (!existing || existing.source !== 'user')) {
      throw new ValidationError('Recette introuvable.')
    }
    const row = buildRecipeRow(current.id, current.source, input, now, existing?.favorite ?? current.favorite)
    if (recipeContentEquals(toRecipeInput(current), toRecipeInput(row)) && existing?.deleted !== true)
      return current
    await db.recipes.put(row)
    return row
  })
}

/** Bascule le favori ; une recette de départ sans surcharge en reçoit une (copie complète). */
export async function setRecipeFavorite(
  recipe: Recipe | LibraryRecipe,
  favorite: boolean,
  now: IsoDateTime = nowIso(),
): Promise<Recipe> {
  return db.transaction('rw', db.recipes, async () => {
    const existing = await db.recipes.get(recipe.id)
    if (existing) {
      if ((existing.favorite ?? false) === favorite) return existing
      const next = { ...existing, favorite, updatedAt: now }
      await db.recipes.put(next)
      return next
    }
    if (recipe.source !== 'seed') throw new ValidationError('Recette introuvable.')
    if ((recipe.favorite ?? false) === favorite) return recipe
    const next = buildRecipeRow(recipe.id, 'seed', recipe, now, favorite, false)
    await db.recipes.put(next)
    return next
  })
}

/**
 * Recette de départ : écrit une surcharge `deleted: true` (« Rétablir » la fait réapparaître).
 * Recette personnelle : supprime la ligne ET ses lignes de frigo, en une transaction ; le journal garde son nom figé.
 */
export async function deleteRecipe(
  recipe: Recipe | LibraryRecipe,
  now: IsoDateTime = nowIso(),
): Promise<void> {
  if (recipe.source === 'user') {
    await db.transaction('rw', [db.recipes, db.fridge], async () => {
      await db.recipes.delete(recipe.id)
      await db.fridge.where('recipeId').equals(recipe.id).delete()
    })
    return
  }
  // Pas de revalidation : la surcharge reprend `recipe` (original ou version modifiée).
  const row = buildRecipeRow(recipe.id, 'seed', recipe, now, recipe.favorite, false)
  row.deleted = true
  await db.recipes.put(row)
}

/** Supprime la surcharge d'une recette de départ (rétablit l'original ou annule une suppression). */
export async function restoreRecipe(id: Id, original?: Recipe, now: IsoDateTime = nowIso()): Promise<void> {
  await db.transaction('rw', db.recipes, async () => {
    const row = await db.recipes.get(id)
    if (row?.source !== 'seed') return
    await db.recipes.delete(id)
    // Comme « Rétablir » d'un aliment Ciqual : un favori posé sur la surcharge survit (original + favori), sauf si la
    // surcharge était une suppression ou si l'appelant ne fournit pas `original` (src/db n'importe pas src/content).
    if (row.favorite === true && row.deleted !== true && original) {
      await db.recipes.put({ ...buildRecipeRow(id, 'seed', original, now, true, false) })
    }
  })
}

// ---------- Frigo ----------

export async function listFridge(): Promise<FridgeItem[]> {
  return db.fridge.toArray()
}

function checkFridge(item: FridgeItem): FridgeItem {
  if (!fridgeItemSchema.safeParse(item).success) {
    throw new ValidationError('Ligne du frigo invalide : vérifie les champs saisis.')
  }
  fail(validateFridgeItem(item))
  return item
}

/** Ajoute un batch préparé (l'appelant calcule `expiresOn` avec le domaine). */
export async function prepareFridge(item: FridgeItem): Promise<FridgeItem> {
  const row = checkFridge({ ...item })
  await db.fridge.add(row)
  return row
}

/** Modifie portions restantes et/ou péremption. `portionsLeft ≤ 0` supprime la ligne (renvoie `undefined`). */
export async function updateFridgeItem(
  id: Id,
  patch: { portionsLeft?: number; expiresOn?: FridgeItem['expiresOn'] },
): Promise<FridgeItem | undefined> {
  return db.transaction('rw', db.fridge, async () => {
    const current = await db.fridge.get(id)
    if (!current) throw new ValidationError('Ligne du frigo introuvable.')
    if (patch.portionsLeft !== undefined && Number.isFinite(patch.portionsLeft) && patch.portionsLeft <= 0) {
      await db.fridge.delete(id)
      return undefined
    }
    const next = checkFridge({
      ...current,
      ...(patch.portionsLeft !== undefined ? { portionsLeft: patch.portionsLeft } : {}),
      ...(patch.expiresOn !== undefined ? { expiresOn: patch.expiresOn } : {}),
    })
    await db.fridge.put(next)
    return next
  })
}

export async function deleteFridgeItem(id: Id): Promise<void> {
  await db.fridge.delete(id)
}

/**
 * Ajoute les entrées au journal ; chaque entrée `{ kind: 'recipe', fridgeItemId }` décrémente le frigo dans la même
 * transaction (tout ou rien). `portionsLeft` ne descend pas sous 0 et la ligne est supprimée à 0 ; une ligne
 * introuvable lève une `ValidationError` sans rien écrire.
 * Choix simple : supprimer ensuite une entrée du journal NE remet PAS les portions au frigo (l'utilisateur
 * les rajoute à la main via `updateFridgeItem`).
 */
export async function logRecipeEntries(entries: FoodLogEntry[]): Promise<FoodLogEntry[]> {
  return db.transaction('rw', [db.foodLog, db.fridge], async () => {
    const rows = await addLogEntries(entries)
    const used = new Map<Id, number>()
    for (const e of rows) {
      if (e.origin.kind === 'recipe' && e.origin.fridgeItemId !== undefined) {
        used.set(e.origin.fridgeItemId, (used.get(e.origin.fridgeItemId) ?? 0) + e.origin.portions)
      }
    }
    for (const [fridgeId, portions] of used) {
      const item = await db.fridge.get(fridgeId)
      if (!item)
        throw new ValidationError('Ligne du frigo introuvable : ces portions ne sont plus disponibles.')
      const foreign = rows.some(
        (e) =>
          e.origin.kind === 'recipe' &&
          e.origin.fridgeItemId === fridgeId &&
          e.origin.recipeId !== item.recipeId,
      )
      if (foreign) throw new ValidationError('Ces portions du frigo appartiennent à une autre recette.')
      // Arrondi à 1e-6 pour éviter les restes flottants (0,1 + 0,2).
      const left = Math.round((item.portionsLeft - portions) * 1e6) / 1e6
      if (left <= 0) await db.fridge.delete(fridgeId)
      else await db.fridge.put({ ...item, portionsLeft: left })
    }
    return rows
  })
}

/**
 * Annule un `logRecipeEntries` (bouton « Annuler ») en une transaction : supprime les entrées encore présentes et
 * remet chaque ligne de frigo concernée vers son état d'avant (`fridgeBefore`, instantané pris avant le log) :
 * portions actuelles (0 si la ligne a été supprimée) + portions annulées, plafonnées à l'instantané, dates de
 * l'instantané. Une entrée déjà supprimée est ignorée, donc l'appel est idempotent.
 */
export async function undoRecipeEntries(entries: FoodLogEntry[], fridgeBefore: FridgeItem[]): Promise<void> {
  await db.transaction('rw', [db.foodLog, db.fridge], async () => {
    const given = new Map<Id, number>()
    for (const e of entries) {
      if (!(await db.foodLog.get(e.id))) continue
      await db.foodLog.delete(e.id)
      if (e.origin.kind === 'recipe' && e.origin.fridgeItemId !== undefined) {
        given.set(e.origin.fridgeItemId, (given.get(e.origin.fridgeItemId) ?? 0) + e.origin.portions)
      }
    }
    for (const [fridgeId, portions] of given) {
      const before = fridgeBefore.find((f) => f.id === fridgeId)
      if (!before) continue
      const current = await db.fridge.get(fridgeId)
      const left =
        Math.round(Math.min(before.portionsLeft, (current?.portionsLeft ?? 0) + portions) * 1e6) / 1e6
      await db.fridge.put({ ...before, portionsLeft: left })
    }
  })
}

// ---------- Listes de courses ----------

export async function listShoppingLists(): Promise<ShoppingList[]> {
  return db.shoppingLists.toArray()
}

export async function getShoppingList(id: Id): Promise<ShoppingList | undefined> {
  return db.shoppingLists.get(id)
}

/** Crée ou remplace la liste (put) ; `updatedAt` est mis à jour, `createdAt` d'une liste existante conservé. */
export async function saveShoppingList(
  list: ShoppingList,
  now: IsoDateTime = nowIso(),
): Promise<ShoppingList> {
  return db.transaction('rw', db.shoppingLists, async () => {
    const existing = await db.shoppingLists.get(list.id)
    const next: ShoppingList = {
      ...list,
      name: list.name.trim(),
      createdAt: existing?.createdAt ?? list.createdAt,
      updatedAt: now,
    }
    if (!shoppingListSchema.safeParse(next).success) {
      throw new ValidationError('Liste de courses invalide : vérifie les champs saisis.')
    }
    fail(validateShoppingList(next))
    await db.shoppingLists.put(next)
    return next
  })
}

export async function setShoppingItemChecked(
  listId: Id,
  itemId: Id,
  checked: boolean,
  now: IsoDateTime = nowIso(),
): Promise<ShoppingList> {
  return db.transaction('rw', db.shoppingLists, async () => {
    const list = await db.shoppingLists.get(listId)
    if (!list) throw new ValidationError('Liste de courses introuvable.')
    if (!list.items.some((i) => i.id === itemId)) throw new ValidationError('Article introuvable.')
    const next: ShoppingList = {
      ...list,
      items: list.items.map((i) => (i.id === itemId ? { ...i, checked } : i)),
      updatedAt: now,
    }
    await db.shoppingLists.put(next)
    return next
  })
}

export async function deleteShoppingList(id: Id): Promise<void> {
  await db.shoppingLists.delete(id)
}

// ---------- Import JSON (Réglages → Importer) ----------

/** Crée les recettes (source `user`) et ajoute les entrées de journal en une transaction : tout ou rien. */
export async function commitImport(
  recipes: RecipeInput[],
  entries: FoodLogEntry[],
  now: IsoDateTime = nowIso(),
): Promise<ImportOutcome> {
  const rows = recipes.map((r) => buildRecipeRow(newId(), 'user', r, now, false))
  return db.transaction('rw', [db.recipes, db.foodLog], async () => {
    const added = await addLogEntries(entries)
    if (rows.length > 0) await db.recipes.bulkAdd(rows)
    return { recipesCreated: rows.length, mealsLogged: added.length, entries: added }
  })
}
