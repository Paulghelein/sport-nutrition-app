// F4 : « Recette par scan ». Brouillon d'ingrédients (produits scannés, aliments perso, Ciqual) converti en
// `RecipeInput`. Les macros par portion se calculent avec `recipeNutrition` (recipes.ts) sur le résultat de
// `draftToRecipeInput` : aucun second calcul ici.
import type { Aisle, CiqualFood, Food, MealSlot } from '../../types/nutrition'
import { MAX_INGREDIENT_GRAMS, MAX_RECIPE_NAME_LENGTH, MAX_RECIPE_SERVINGS, MAX_SERVING_UNIT_LENGTH, SERVING_UNIT_MESSAGE } from './limits'
import type { RecipeInput, ScanIngredient, ScanRecipeDraft } from '../../types/recipes'

/** Quantité proposée quand on ne sait rien du produit. */
export const DEFAULT_SCAN_GRAMS = 100
/** Repas d'une recette par scan quand l'utilisateur n'en a coché aucun (comme `emptyRecipeInput`). */
export const DEFAULT_SCAN_MEAL: MealSlot = 'lunch'

export interface ScanIngredientOptions {
  /** Clé locale unique dans la liste (fournie par l'appelant : la fonction reste pure). */
  key: string
  /** Quantité imposée ; sinon paquet entier, puis portion habituelle, puis 100 g. */
  grams?: number
}

const wholeFlag = (grams: number, packageG: number | undefined): boolean => packageG !== undefined && grams === packageG

/** Aliment de la table `foods` (produit OFF scanné ou aliment perso) -> ingrédient. */
export function scanIngredientFromFood(food: Food, opts: ScanIngredientOptions): ScanIngredient {
  const grams = opts.grams ?? food.packageG ?? food.defaultPortionG ?? DEFAULT_SCAN_GRAMS
  const ing: ScanIngredient = {
    key: opts.key,
    name: food.name,
    grams,
    origin: food.source === 'off' || food.ean !== undefined ? 'scan' : 'food',
    foodId: food.id,
    aisle: food.aisle ?? 'other',
  }
  if (food.packageG !== undefined) ing.packageG = food.packageG
  if (wholeFlag(grams, food.packageG)) ing.wholePackage = true
  return ing
}

/** Aliment Ciqual -> ingrédient (`ciqualCode`, pas de `foodId`). Rayon : « autre » (Ciqual n'en donne pas). */
export function scanIngredientFromCiqual(
  food: CiqualFood,
  opts: ScanIngredientOptions & { aisle?: Aisle },
): ScanIngredient {
  return {
    key: opts.key,
    name: food.name,
    grams: opts.grams ?? DEFAULT_SCAN_GRAMS,
    origin: 'ciqual',
    ciqualCode: food.code,
    aisle: opts.aisle ?? 'other',
  }
}

/** Nouvelle quantité ; `wholePackage` vrai seulement si elle égale exactement le paquet. */
export function setIngredientGrams(ing: ScanIngredient, grams: number): ScanIngredient {
  const next: ScanIngredient = { ...ing, grams }
  if (wholeFlag(grams, ing.packageG)) next.wholePackage = true
  else delete next.wholePackage
  return next
}

/** Raccourci « paquet entier » ; sans `packageG`, renvoie l'ingrédient inchangé. */
export function withWholePackage(ing: ScanIngredient): ScanIngredient {
  return ing.packageG === undefined ? ing : setIngredientGrams(ing, ing.packageG)
}

/** Étape unique des recettes par scan (`validateRecipeInput` exige au moins une étape) ; modifiable ensuite. */
export const SCAN_DEFAULT_STEP = 'Recette créée par scan : ajoute les étapes depuis la fiche si besoin.'

/** Nom d'ingrédient non vide : nom saisi, sinon « Produit <ean> » (id `off-<ean>`), sinon « Aliment Ciqual <code> ». */
function ingredientName(i: ScanIngredient): string {
  const name = i.name.trim()
  if (name !== '') return name
  if (i.ciqualCode !== undefined) return `Aliment Ciqual ${i.ciqualCode}`
  if (i.foodId?.startsWith('off-')) return `Produit ${i.foodId.slice(4)}`
  return 'Ingrédient'
}

const DEFAULT_UNIT = 'portions'

/** Unité trimée, ou undefined si vide ou « portions » (insensible à la casse). */
function cleanUnit(unit: string): string | undefined {
  const u = unit.trim()
  return u === '' || u.toLowerCase() === DEFAULT_UNIT ? undefined : u
}

/** Brouillon -> recette perso (champs de `RecipeInput`). Ne valide pas : appeler `checkScanDraft` avant. */
export function draftToRecipeInput(draft: ScanRecipeDraft): RecipeInput {
  const input: RecipeInput = {
    name: draft.name.trim(),
    meal: draft.meal.length > 0 ? [...draft.meal] : [DEFAULT_SCAN_MEAL],
    servings: draft.servings,
    prepMinutes: 0,
    cookMinutes: 0,
    tags: [],
    ingredients: draft.ingredients.map((i) => {
      const out: RecipeInput['ingredients'][number] = { name: ingredientName(i), grams: i.grams, aisle: i.aisle }
      if (i.origin === 'ciqual') {
        if (i.ciqualCode !== undefined) out.ciqualCode = i.ciqualCode
      } else if (i.foodId !== undefined) out.foodId = i.foodId
      return out
    }),
    steps: [SCAN_DEFAULT_STEP],
  }
  const unit = cleanUnit(draft.servingUnit)
  if (unit !== undefined) input.servingUnit = unit
  return input
}

/** Premier problème du brouillon (message français), ou null s'il est valide. */
export function checkScanDraft(draft: ScanRecipeDraft): string | null {
  const name = draft.name.trim()
  if (name === '') return 'Donne un nom à la recette.'
  if (name.length > MAX_RECIPE_NAME_LENGTH) return `Le nom ne peut pas dépasser ${MAX_RECIPE_NAME_LENGTH} caractères.`
  if (draft.ingredients.length === 0) return 'Ajoute au moins un ingrédient.'
  if (!Number.isInteger(draft.servings) || draft.servings < 1 || draft.servings > MAX_RECIPE_SERVINGS) {
    return `Le nombre de portions doit être un entier entre 1 et ${MAX_RECIPE_SERVINGS}.`
  }
  for (const i of draft.ingredients) {
    if (i.origin === 'ciqual' ? i.ciqualCode === undefined : i.foodId === undefined) {
      return `L'ingrédient « ${ingredientName(i)} » n'est relié à aucun aliment : retire-le puis cherche-le à nouveau.`
    }
    if (!Number.isFinite(i.grams) || i.grams <= 0 || i.grams > MAX_INGREDIENT_GRAMS) {
      return `La quantité de « ${ingredientName(i)} » doit être supérieure à 0 g et au plus ${MAX_INGREDIENT_GRAMS} g.`
    }
  }
  if (draft.servingUnit.trim().length > MAX_SERVING_UNIT_LENGTH) {
    return SERVING_UNIT_MESSAGE
  }
  return null
}

/** « 6 muffins », « 1 portion », « 3 portions ». Unité absente ou « portions » : singulier si n = 1. */
export function servingLabel(n: number, unit?: string): string {
  const u = unit === undefined ? undefined : cleanUnit(unit)
  if (u === undefined) return `${n} ${n === 1 ? 'portion' : 'portions'}`
  return `${n} ${u}`
}
