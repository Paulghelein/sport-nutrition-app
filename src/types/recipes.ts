// Recettes, frigo, liste de courses, import JSON (J6, SPEC §4.3, IMPORT_FORMAT.md).
import type { Id, LocalDate } from './common'
import type { Aisle, Food, FoodLogEntry, FridgeItem, Macros, MealSlot, Per100g, Recipe, ShoppingItem } from './nutrition'
import type { ImportedExercise, ImportedExercisePreference, ImportedSessionPlan } from './claude'

// ---------- Bibliothèque (seed + surcharges, comme les exercices) ----------

/** Champs saisis à la création ou à la modification d'une recette (SPEC §9). */
export type RecipeInput = Omit<Recipe, 'id' | 'source' | 'deleted' | 'updatedAt' | 'favorite'>

/**
 * Recette telle que l'app la présente : `SEED_RECIPES` fusionné avec les lignes `recipes` (fonction pure
 * `mergeRecipes`). Une ligne `seed` de même id remplace l'original ; `deleted` masque ; les recettes `user`
 * supprimées sont retirées de la base (le journal garde son nom figé, le frigo est vidé dans la même transaction).
 */
export interface LibraryRecipe extends Recipe {
  /** Recette de départ modifiée : « Rétablir l'original » est possible (supprimer la surcharge). */
  overridden: boolean
}

// ---------- Macros (calculées depuis Ciqual / aliments, jamais stockées dans la recette) ----------

/**
 * Comment un ingrédient obtient ses valeurs, par priorité :
 * `food` (`foodId` présent dans les aliments fusionnés) → `ciqual` (`ciqualCode` trouvé) → `per100g` (valeurs
 * fournies) → `missing` (aucune donnée : macros 0, signalé à l'utilisateur).
 */
export type IngredientResolution = 'food' | 'ciqual' | 'per100g' | 'missing'

export interface ResolvedIngredient {
  ingredient: Recipe['ingredients'][number]
  resolution: IngredientResolution
  per100g: Per100g | null
  /** Macros pour `ingredient.grams` (recette entière). */
  macros: Macros
}

export interface RecipeNutrition {
  ingredients: ResolvedIngredient[]
  /** Recette entière. */
  total: Macros
  /** `total / servings`, non arrondi. */
  perServing: Macros
  /** Noms des ingrédients sans données (`missing`). */
  missing: string[]
}

/**
 * Accès aux valeurs nutritionnelles pour le calcul : aliments fusionnés (`mergeFoods`) indexés par id ; les
 * aliments Ciqual sont sous l'id `ciqual-<code>`. Fonction plutôt que Map pour laisser l'appelant choisir.
 */
export type FoodLookup = (id: Id) => Food | undefined

// ---------- Liste et filtres (SPEC §4.3) ----------

export interface RecipeFilter {
  /** Recherche dans le nom (sans accents ni casse). */
  query?: string
  meal?: MealSlot
  /** Préparation + cuisson ≤ N minutes. */
  maxTotalMinutes?: number
  minProteinPerServing?: number
  /** Au moins un ingrédient dont le nom contient ce texte (sans accents ni casse). */
  ingredient?: string
  favoritesOnly?: boolean
}

export interface RecipeListItem {
  recipe: LibraryRecipe
  perServing: Macros
  totalMinutes: number
}

// ---------- Mode cuisine ----------

/** Ingrédient mis à l'échelle pour un nombre de portions (grammes arrondis à l'unité, ≥ 1 si > 0). */
export interface ScaledIngredient {
  name: string
  grams: number
  aisle: Aisle
}

// ---------- Journal et frigo ----------

/**
 * Loguer des portions d'une recette. Macros figées = `perServing × portions` au moment du log
 * (origine `{ kind: 'recipe', recipeId, portions, fridgeItemId? }`). Avec `fridgeItemId`, la portion est
 * décrémentée du frigo dans la même transaction que l'ajout au journal (`portionsLeft` ne descend pas sous 0 ;
 * à 0 la ligne frigo est supprimée).
 */
export interface RecipeLogInput {
  recipeId: Id
  portions: number
  date: LocalDate
  slot: MealSlot
  fridgeItemId?: Id
}

/** Préparation d'un batch : `expiresOn = preparedOn + (recipe.fridgeDays ?? DEFAULT_FRIDGE_DAYS)`. */
export interface FridgePrepInput {
  recipeId: Id
  portions: number
  preparedOn: LocalDate
}

/** Ligne du frigo présentée : recette résolue (absente si supprimée), jours restants (négatif = périmé). */
export interface FridgeView {
  item: FridgeItem
  recipe?: LibraryRecipe
  daysLeft: number
  expired: boolean
}

// ---------- Liste de courses ----------

/** Rayon et ses articles, dans l'ordre `AISLE_ORDER` ; articles triés par nom. */
export interface ShoppingGroup {
  aisle: Aisle
  items: ShoppingItem[]
}

// ---------- Import JSON (Réglages → Importer, IMPORT_FORMAT.md) ----------

/** Repas importé (ex. restaurant), converti en entrée de journal `{ kind: 'import', estimated }`. */
export interface ImportedMeal {
  name: string
  date: LocalDate
  slot: MealSlot
  estimated: boolean
  totals: Macros
}

/**
 * Élément de l'aperçu, dans l'ordre du tableau source (`index`). Valeurs françaises déjà converties
 * (`petit-dej` → `breakfast`, `fruits-legumes` → `produce`…). `warnings` : remarques non bloquantes
 * (ingrédient sans données, relié à Ciqual par le nom, date future…).
 * Les types J9 (`sessionPlan`, `exercise`, `exercisePreference`) ne sont analysés que si `ImportContext.exercises`
 * est fourni (écran « Coller la réponse de Claude ») ; sinon `unsupported`.
 */
export type ImportPreviewItem =
  | { kind: 'recipe'; index: number; recipe: RecipeInput; warnings: string[] }
  | { kind: 'meal'; index: number; meal: ImportedMeal; warnings: string[] }
  | { kind: 'sessionPlan'; index: number; plan: ImportedSessionPlan; warnings: string[] }
  | { kind: 'exercise'; index: number; exercise: ImportedExercise; warnings: string[] }
  | { kind: 'exercisePreference'; index: number; preference: ImportedExercisePreference; warnings: string[] }
  | { kind: 'unsupported'; index: number; type: string; message: string }
  | { kind: 'invalid'; index: number; errors: string[] }

/**
 * Lecture d'un texte collé ou d'un fichier : un tableau JSON, un objet seul, ou un texte contenant un bloc
 * ```json (réponse de Claude). `ok: false` = rien d'exploitable (JSON illisible, aucun élément).
 */
export type ImportParseResult = { ok: true; items: ImportPreviewItem[] } | { ok: false; error: string }

/** Ce que l'utilisateur confirme après l'aperçu (éléments cochés). */
export interface ImportSelection {
  recipes: RecipeInput[]
  meals: ImportedMeal[]
  /** J9 (optionnels : l'import de Réglages n'en produit pas). `index` = position dans la réponse source. */
  exercises?: { index: number; exercise: ImportedExercise }[]
  preferences?: ImportedExercisePreference[]
  sessionPlan?: ImportedSessionPlan
}

export interface ImportOutcome {
  recipesCreated: number
  mealsLogged: number
  /** Entrées de journal créées (macros figées). */
  entries: FoodLogEntry[]
}
