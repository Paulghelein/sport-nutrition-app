// Recettes de départ (SPEC §4.3) : petits-déjeuners, plats batch, collations protéinées, plats rapides.
// Ids figés : ne jamais renommer une recette publiée (frigo, journal et surcharges en dépendent).
import type { Recipe } from '../../types'
import { batchRecipes } from './batch'
import { breakfastRecipes } from './breakfast'
import { quickRecipes } from './quick'
import { snackRecipes } from './snacks'

export const SEED_RECIPES: readonly Recipe[] = [
  ...breakfastRecipes,
  ...batchRecipes,
  ...snackRecipes,
  ...quickRecipes,
]
