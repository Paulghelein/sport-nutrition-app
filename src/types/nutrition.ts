// Aliments, recettes, frigo, journal, courses (SPEC §4).
// Les identifiants sont en anglais ; l'import (IMPORT_FORMAT.md) convertit les valeurs françaises.
import type { ContentSource, Id, IsoDateTime, LocalDate } from './common'

/** petit-dej → breakfast, dejeuner → lunch, diner → dinner, collation → snack. */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

/** Rayons (IMPORT_FORMAT.md) : fruits-legumes, boucherie, poissonnerie, cremerie, epicerie, surgeles, boulangerie, autre. */
export type Aisle = 'produce' | 'butcher' | 'fish' | 'dairy' | 'grocery' | 'frozen' | 'bakery' | 'other'

/** kcal et grammes de macronutriments. Valeurs non arrondies en interne. */
export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface Per100g extends Macros {
  fiber?: number
}

export type FoodSource = 'ciqual' | 'off' | 'user'

export interface Food {
  /** `ciqual-<code>`, `off-<ean>` ou UUID. */
  id: Id
  name: string
  source: FoodSource
  ciqualCode?: string
  ean?: string
  brand?: string
  per100g: Per100g
  /** Portion habituelle proposée à la saisie. */
  defaultPortionG?: number
  aisle?: Aisle
  favorite: boolean
  /** Non utilisé : les récents sont dérivés du journal (`QuickItem`). Conservé pour les sauvegardes. */
  lastUsedAt?: IsoDateTime
  updatedAt: IsoDateTime
}

export interface RecipeIngredient {
  name: string
  grams: number
  foodId?: Id
  ciqualCode?: string
  aisle: Aisle
  /** Valeurs fournies quand l'ingrédient n'est relié à aucun aliment. */
  per100g?: Per100g
}

export interface Recipe {
  id: Id
  name: string
  meal: MealSlot[]
  servings: number
  prepMinutes: number
  cookMinutes: number
  fridgeDays?: number
  tags: string[]
  ingredients: RecipeIngredient[]
  steps: string[]
  source: ContentSource
  /** Surcharge d'une recette de départ supprimée par l'utilisateur. */
  deleted?: boolean
  favorite?: boolean
  updatedAt: IsoDateTime
}

/** Portions préparées au frigo, décrémentées quand on en logue une. */
export interface FridgeItem {
  id: Id
  recipeId: Id
  portionsLeft: number
  preparedOn: LocalDate
  expiresOn: LocalDate
}

export type FoodLogOrigin =
  | { kind: 'food'; foodId: Id; grams: number }
  | { kind: 'recipe'; recipeId: Id; portions: number; fridgeItemId?: Id }
  | { kind: 'free' }
  | { kind: 'import'; estimated: boolean }

export interface FoodLogEntry {
  id: Id
  date: LocalDate
  slot: MealSlot
  name: string
  origin: FoodLogOrigin
  /** Totaux de l'entrée, figés au moment du log (jamais recalculés). */
  macros: Macros
  createdAt: IsoDateTime
}

export interface ShoppingItem {
  id: Id
  name: string
  grams: number
  aisle: Aisle
  foodId?: Id
  checked: boolean
}

export interface ShoppingList {
  id: Id
  name: string
  sources: { recipeId: Id; portions: number }[]
  items: ShoppingItem[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

// ---------- Ciqual (SPEC §4.4) ----------

/**
 * Ligne compacte du fichier Ciqual embarqué : `[code, nom, groupe, kcal, protéines, glucides, lipides, fibres]`
 * pour 100 g. `groupe` = index dans `CiqualDataset.groups`. Valeurs absentes de Ciqual : « traces » → 0,
 * « < x » → x / 2 ; un aliment sans kcal ni macros exploitables n'est pas embarqué. Fibres absentes → `null`.
 */
export type CiqualRow = [
  code: string,
  name: string,
  group: number,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number | null,
]

/** Fichier JSON généré par `scripts/ciqual.mjs` (src/content/foods/ciqual.json), chargé à la demande (`import()`). */
export interface CiqualDataset {
  /** Version de la table source (ex. `'2020'`) + révision du script (ex. `'2020-r1'`). Change → rechargement. */
  version: string
  groups: string[]
  foods: CiqualRow[]
}

/**
 * Aliment Ciqual tel que stocké dans la table Dexie `ciqual` (données de référence, hors sauvegarde, rechargées
 * quand `CiqualDataset.version` change). Les surcharges de l'utilisateur (favori, valeurs corrigées) vivent dans
 * `foods` avec le même id et `source: 'ciqual'` (même principe que les exercices : la ligne `foods` gagne).
 */
export interface CiqualFood {
  /** `ciqual-<code>`. */
  id: Id
  code: string
  name: string
  group: string
  /** Nom normalisé pour la recherche (minuscules, sans accents ni ponctuation), voir `normalizeFoodSearch`. */
  search: string
  per100g: Per100g
}

// ---------- Objectifs (SPEC §4.1) ----------

/** Objectifs du jour, arrondis à l'entier (kcal, g). */
export interface NutritionTargets extends Macros {
  bmr: number
  tdee: number
  /** Poids utilisé : moyenne mobile 7 jours, sinon dernière pesée. */
  weightKg: number
  ageYears: number
}

/**
 * Proposition après stagnation (SPEC §4.1) : moyenne 7 j stable (< +0,1 kg) sur 21 jours, objectif `bulk`, et pas
 * d'ajustement depuis 21 jours (`NutritionParams.kcalAdjustedOn`). Acceptée → `kcalAdjustment + kcal`.
 */
export interface KcalSuggestion {
  kcal: number
  /** Variation de la moyenne 7 j sur la période, en kg. */
  changeKg: number
  days: number
  message: string
}

// ---------- Journal (SPEC §4.2) ----------

export interface MealTotals {
  slot: MealSlot
  entries: FoodLogEntry[]
  totals: Macros
}

/** Journal d'un jour : repas dans l'ordre petit-déj, déjeuner, dîner, collations (toujours les 4). */
export interface DayLog {
  date: LocalDate
  meals: MealTotals[]
  totals: Macros
}

/** Saisie libre : nom + kcal, macros optionnelles (absentes → 0 dans l'entrée figée). */
export interface FreeEntryInput {
  name: string
  kcal: number
  protein?: number
  carbs?: number
  fat?: number
}

/**
 * Élément re-loguable en un tap (favoris, récents) :
 * - `food` : un aliment et la dernière quantité utilisée (macros recalculées au log depuis l'aliment) ;
 * - `free` : une saisie libre ou importée récente (macros reprises telles quelles).
 * Les récents sont dérivés du journal (pas de `Food.lastUsedAt`), dédoublonnés par aliment ou par nom.
 */
export type QuickItem =
  | { kind: 'food'; key: string; food: Food; grams: number }
  | { kind: 'free'; key: string; name: string; macros: Macros }

/** Champs saisis à la création ou à la modification d'un aliment personnel (ou d'une surcharge Ciqual). */
export interface FoodInput {
  name: string
  brand?: string
  per100g: Per100g
  defaultPortionG?: number
  aisle?: Aisle
}
