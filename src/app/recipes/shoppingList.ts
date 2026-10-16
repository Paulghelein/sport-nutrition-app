import { listShoppingLists, saveShoppingList } from '../../db'
import { buildShoppingItems } from '../../domain/nutrition'
import type { Recipe, ShoppingItem, ShoppingList } from '../../types'

export const SHOPPING_LIST_NAME = 'Courses'

/** La liste courante = la dernière modifiée (l'app n'en garde qu'une seule en usage). */
export async function loadCurrentList(): Promise<ShoppingList | undefined> {
  const lists = await listShoppingLists()
  return lists.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))[0]
}

/**
 * Recalcule les articles depuis les sources (recettes × portions) en gardant les cochés et les articles manuels.
 * Les sources dont la recette n'existe plus sont retirées.
 */
export async function rebuildList(
  base: ShoppingList | undefined,
  sources: readonly { recipeId: string; portions: number }[],
  recipes: readonly Recipe[],
): Promise<ShoppingList> {
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const found = sources.filter((s) => s.portions > 0 && byId.has(s.recipeId))
  const items = buildShoppingItems(
    found.flatMap((s) => {
      const recipe = byId.get(s.recipeId)
      return recipe ? [{ recipe, portions: s.portions }] : []
    }),
    base?.items,
    () => crypto.randomUUID(),
  )
  const now = new Date().toISOString()
  return saveShoppingList({
    id: base?.id ?? crypto.randomUUID(),
    name: base?.name ?? SHOPPING_LIST_NAME,
    sources: found.map((s) => ({ ...s })),
    items,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  })
}

/** Ajoute une recette à la liste courante (portions cumulées si elle y est déjà). */
export async function addRecipeToList(
  recipe: Recipe,
  portions: number,
  recipes: readonly Recipe[],
): Promise<ShoppingList> {
  const base = await loadCurrentList()
  const sources = [...(base?.sources ?? [])]
  const i = sources.findIndex((s) => s.recipeId === recipe.id)
  const existing = i >= 0 ? sources[i] : undefined
  if (existing) sources[i] = { ...existing, portions: existing.portions + portions }
  else sources.push({ recipeId: recipe.id, portions })
  return rebuildList(base, sources, recipes)
}

/** Ajoute un article manuel à la liste courante (la crée si besoin). */
export async function addManualItem(
  base: ShoppingList | undefined,
  item: ShoppingItem,
): Promise<ShoppingList> {
  const now = new Date().toISOString()
  return saveShoppingList({
    id: base?.id ?? crypto.randomUUID(),
    name: base?.name ?? SHOPPING_LIST_NAME,
    sources: base?.sources ?? [],
    items: [...(base?.items ?? []), item],
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  })
}
