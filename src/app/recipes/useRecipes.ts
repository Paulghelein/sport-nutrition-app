import { useMemo } from 'react'
import { SEED_RECIPES } from '../../content/recipes'
import { listFridge, listRecipeRows } from '../../db'
import { mergeRecipes, recipeNutrition } from '../../domain/nutrition'
import type { FoodIndex } from '../../domain/nutrition'
import type { FoodLookup, FridgeItem, LibraryRecipe, Recipe } from '../../types'
import { useLiveQuery } from '../../ui'
import { useFoods } from '../nutrition/useFoods'

export interface RecipeLibraryData {
  /** Recettes fusionnées (départ + base). */
  recipes: LibraryRecipe[]
  /** Lignes brutes de la table `recipes` (pour retrouver les recettes de départ supprimées). */
  rows: Recipe[]
  seeds: readonly Recipe[]
  /** Aliments fusionnés par id (`ciqual-<code>` pour Ciqual) : sert au calcul des macros. */
  lookup: FoodLookup
  index: FoodIndex
  /** La base Ciqual n'a pas pu être chargée : les macros des recettes reliées à Ciqual sont incomplètes. */
  ciqualFailed: boolean
  retry: () => void
}

/**
 * Recettes + aliments. `data` reste `undefined` tant que la base d'aliments (Ciqual) se prépare : sans elle,
 * les macros seraient fausses. Si Ciqual ne se charge pas, on continue (ingrédients signalés « sans données »).
 */
export function useRecipeLibrary(): { data: RecipeLibraryData | undefined; error: unknown } {
  const foods = useFoods()
  const rows = useLiveQuery(() => listRecipeRows(), [])
  const ready =
    foods.foods !== undefined && foods.index !== undefined && (!foods.preparing || foods.error != null)
  const data = useMemo<RecipeLibraryData | undefined>(() => {
    if (!rows.data || !foods.foods || !foods.index || !ready) return undefined
    const byId = new Map(foods.foods.map((f) => [f.id, f]))
    return {
      recipes: mergeRecipes(SEED_RECIPES, rows.data),
      rows: rows.data,
      seeds: SEED_RECIPES,
      lookup: (id) => byId.get(id),
      index: foods.index,
      ciqualFailed: foods.error != null,
      retry: foods.retry,
    }
  }, [rows.data, foods.foods, foods.index, foods.error, foods.retry, ready])
  return { data, error: rows.error }
}

export function useFridge(): { data: FridgeItem[] | undefined; error: unknown } {
  const live = useLiveQuery(() => listFridge(), [])
  return { data: live.data, error: live.error }
}

/** Ids des recettes dont au moins un ingrédient n'a pas de données (macros sous-estimées). */
export function recipesWithMissingData(recipes: readonly LibraryRecipe[], lookup: FoodLookup): Set<string> {
  return new Set(recipes.filter((r) => recipeNutrition(r, lookup).missing.length > 0).map((r) => r.id))
}
