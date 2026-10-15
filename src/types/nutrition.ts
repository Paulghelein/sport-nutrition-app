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
