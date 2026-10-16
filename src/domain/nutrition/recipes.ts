// Recettes (SPEC §4.3, §9) : fusion contenu de départ + base, macros par portion, filtres, mise à l'échelle,
// journal et frigo. Fonctions pures : identifiants et horodatages arrivent en paramètre.
import type { Id, IsoDateTime, LocalDate } from '../../types/common'
import type { FoodLogEntry, FridgeItem, Macros, MealSlot, Per100g, Recipe } from '../../types/nutrition'
import type {
  FoodLookup,
  FridgePrepInput,
  FridgeView,
  IngredientResolution,
  LibraryRecipe,
  RecipeFilter,
  RecipeInput,
  RecipeListItem,
  RecipeLogInput,
  RecipeNutrition,
  ResolvedIngredient,
  ScaledIngredient,
} from '../../types/recipes'
import { addDays, daysBetween } from '../shared/dates'
import { macrosFor, sumMacros, ZERO_MACROS } from './journal'
import { normalizeFoodSearch } from './search'

export const DEFAULT_FRIDGE_DAYS = 3

const collator = new Intl.Collator('fr')

// ---------- Bibliothèque ----------

/** Trie par nom (locale fr), puis id. Ne modifie pas l'entrée. */
export function sortRecipes<T extends Recipe>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}

/**
 * Recettes présentées : une ligne `seed` de même id remplace l'original (`overridden: true`), `deleted` la masque ;
 * surcharge orpheline ignorée ; lignes `user` ajoutées sauf `deleted` ou collision d'id avec une recette de départ.
 */
export function mergeRecipes(seeds: readonly Recipe[], rows: readonly Recipe[]): LibraryRecipe[] {
  const seedIds = new Set(seeds.map((s) => s.id))
  const overrides = new Map<Id, Recipe>()
  const users: Recipe[] = []
  for (const row of rows) {
    if (row.source === 'seed') {
      if (seedIds.has(row.id)) overrides.set(row.id, row)
    } else if (!row.deleted && !seedIds.has(row.id)) {
      users.push(row)
    }
  }
  const result: LibraryRecipe[] = []
  for (const seed of seeds) {
    const override = overrides.get(seed.id)
    if (override === undefined) result.push({ ...seed, overridden: false })
    else if (override.deleted !== true) result.push({ ...override, overridden: true })
  }
  for (const user of users) result.push({ ...user, overridden: false })
  return sortRecipes(result)
}

/** Recettes de départ masquées par une surcharge `deleted` (originaux, pour la restauration), triées. */
export function deletedSeedRecipes(seeds: readonly Recipe[], rows: readonly Recipe[]): Recipe[] {
  const ids = new Set(rows.filter((r) => r.source === 'seed' && r.deleted === true).map((r) => r.id))
  return sortRecipes(seeds.filter((s) => ids.has(s.id)))
}

// ---------- Macros ----------

function resolveIngredient(
  ingredient: Recipe['ingredients'][number],
  lookup: FoodLookup,
): ResolvedIngredient {
  let resolution: IngredientResolution = 'missing'
  let per100g: Per100g | null = null
  const byId = ingredient.foodId !== undefined ? lookup(ingredient.foodId) : undefined
  const byCode = ingredient.ciqualCode !== undefined ? lookup(`ciqual-${ingredient.ciqualCode}`) : undefined
  if (byId !== undefined) {
    resolution = 'food'
    per100g = byId.per100g
  } else if (byCode !== undefined) {
    resolution = 'ciqual'
    per100g = byCode.per100g
  } else if (ingredient.per100g !== undefined) {
    resolution = 'per100g'
    per100g = ingredient.per100g
  }
  const macros = per100g === null ? { ...ZERO_MACROS } : macrosFor(per100g, ingredient.grams)
  return { ingredient, resolution, per100g, macros }
}

function divideMacros(m: Macros, by: number): Macros {
  return { kcal: m.kcal / by, protein: m.protein / by, carbs: m.carbs / by, fat: m.fat / by }
}

/** Macros de la recette entière et par portion (non arrondies). `servings` ≤ 0 est traité comme 1. */
export function recipeNutrition(recipe: Recipe, lookup: FoodLookup): RecipeNutrition {
  const ingredients = recipe.ingredients.map((i) => resolveIngredient(i, lookup))
  const total = sumMacros(ingredients.map((i) => i.macros))
  const servings = recipe.servings > 0 ? recipe.servings : 1
  return {
    ingredients,
    total,
    perServing: divideMacros(total, servings),
    missing: ingredients.filter((i) => i.resolution === 'missing').map((i) => i.ingredient.name),
  }
}

// ---------- Liste et filtres ----------

export function recipeListItems(recipes: readonly LibraryRecipe[], lookup: FoodLookup): RecipeListItem[] {
  return recipes.map((recipe) => ({
    recipe,
    perServing: recipeNutrition(recipe, lookup).perServing,
    totalMinutes: recipe.prepMinutes + recipe.cookMinutes,
  }))
}

export function filterRecipes(items: readonly RecipeListItem[], filter: RecipeFilter): RecipeListItem[] {
  const query = normalizeFoodSearch(filter.query ?? '')
  const ingredient = normalizeFoodSearch(filter.ingredient ?? '')
  return items.filter(({ recipe, perServing, totalMinutes }) => {
    if (query !== '' && !normalizeFoodSearch(recipe.name).includes(query)) return false
    if (filter.meal !== undefined && !recipe.meal.includes(filter.meal)) return false
    if (filter.maxTotalMinutes !== undefined && totalMinutes > filter.maxTotalMinutes) return false
    if (filter.minProteinPerServing !== undefined && perServing.protein < filter.minProteinPerServing)
      return false
    if (
      ingredient !== '' &&
      !recipe.ingredients.some((i) => normalizeFoodSearch(i.name).includes(ingredient))
    )
      return false
    if (filter.favoritesOnly === true && recipe.favorite !== true) return false
    return true
  })
}

// ---------- Mode cuisine ----------

/** Grammes pour `portions` portions : arrondis à l'unité, au moins 1 g si la quantité de départ est > 0. */
export function scaleGrams(grams: number, servings: number, portions: number): number {
  if (!(grams > 0)) return 0
  const scaled = (grams * portions) / (servings > 0 ? servings : 1)
  return Math.max(1, Math.round(scaled))
}

export function scaleIngredients(recipe: Recipe, portions: number): ScaledIngredient[] {
  return recipe.ingredients.map((i) => ({
    name: i.name,
    grams: scaleGrams(i.grams, recipe.servings, portions),
    aisle: i.aisle,
  }))
}

// ---------- Journal et frigo ----------

function formatPortions(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

/** Longueur maximale d'un nom d'entrée de journal (copie de MAX_LOG_NAME_LENGTH, src/db/validation.ts). */
const MAX_LOG_NAME_LENGTH = 120

/** Nom du journal ; le nom de base est tronqué (« … ») pour que le suffixe `(×n)` tienne dans la limite. */
function logName(name: string, portions: number): string {
  const suffix = portions === 1 ? '' : ` (×${formatPortions(portions)})`
  const room = MAX_LOG_NAME_LENGTH - suffix.length
  const base = name.length <= room ? name : `${name.slice(0, Math.max(0, room - 1)).trimEnd()}…`
  return base + suffix
}

/** Entrée de journal pour `input.portions` portions : macros figées = `perServing × portions`. */
export function recipeLogEntry(
  recipe: Recipe,
  nutrition: RecipeNutrition,
  input: RecipeLogInput,
  { id, createdAt }: { id: Id; createdAt: IsoDateTime },
): FoodLogEntry {
  const k = input.portions
  const m = nutrition.perServing
  return {
    id,
    date: input.date,
    slot: input.slot satisfies MealSlot,
    name: logName(recipe.name, k),
    origin:
      input.fridgeItemId !== undefined
        ? { kind: 'recipe', recipeId: recipe.id, portions: k, fridgeItemId: input.fridgeItemId }
        : { kind: 'recipe', recipeId: recipe.id, portions: k },
    macros: { kcal: m.kcal * k, protein: m.protein * k, carbs: m.carbs * k, fat: m.fat * k },
    createdAt,
  }
}

export function fridgeItemFromPrep(input: FridgePrepInput, recipe: Recipe, id: Id): FridgeItem {
  return {
    id,
    recipeId: input.recipeId,
    portionsLeft: input.portions,
    preparedOn: input.preparedOn,
    expiresOn: addDays(input.preparedOn, recipe.fridgeDays ?? DEFAULT_FRIDGE_DAYS),
  }
}

/** Frigo présenté : le plus proche de la péremption d'abord ; `daysLeft` négatif = périmé. */
export function fridgeViews(
  items: readonly FridgeItem[],
  recipes: readonly LibraryRecipe[],
  today: LocalDate,
): FridgeView[] {
  const byId = new Map(recipes.map((r) => [r.id, r]))
  return [...items]
    .sort((a, b) => (a.expiresOn < b.expiresOn ? -1 : a.expiresOn > b.expiresOn ? 1 : 0))
    .map((item) => {
      const daysLeft = daysBetween(today, item.expiresOn)
      const recipe = byId.get(item.recipeId)
      return recipe === undefined
        ? { item, daysLeft, expired: daysLeft < 0 }
        : { item, recipe, daysLeft, expired: daysLeft < 0 }
    })
}

// ---------- Formulaire ----------

export function emptyRecipeInput(meal: MealSlot = 'lunch'): RecipeInput {
  return {
    name: '',
    meal: [meal],
    servings: 1,
    prepMinutes: 10,
    cookMinutes: 0,
    tags: [],
    ingredients: [],
    steps: [],
  }
}

/** Champs éditables d'une recette (copie profonde ; retire id, source, deleted, favorite, updatedAt, overridden). */
export function toRecipeInput(recipe: Recipe | LibraryRecipe): RecipeInput {
  const input: RecipeInput = {
    name: recipe.name,
    meal: [...recipe.meal],
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    tags: [...recipe.tags],
    ingredients: recipe.ingredients.map((i) => ({
      ...i,
      ...(i.per100g ? { per100g: { ...i.per100g } } : {}),
    })),
    steps: [...recipe.steps],
  }
  if (recipe.fridgeDays !== undefined) input.fridgeDays = recipe.fridgeDays
  if (recipe.servingUnit !== undefined) input.servingUnit = recipe.servingUnit
  return input
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined)
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined)
  return ka.length === kb.length && ka.every((k) => k in rb && deepEqual(ra[k], rb[k]))
}

/** Contenu identique (ordre des tableaux compris) : permet de ne rien écrire quand rien n'a changé. */
export function recipeContentEquals(a: RecipeInput, b: RecipeInput): boolean {
  return deepEqual(a, b)
}
