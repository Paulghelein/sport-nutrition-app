// Bornes et règles partagées entre le domaine (checkScanDraft, fetchOffPhoto) et src/db (validation, sauvegarde).
// Aucune dépendance : source unique, à importer plutôt qu'à redéfinir.
import type { PhotoMime } from '../../types/nutrition'

export const MAX_RECIPE_NAME_LENGTH = 120
export const MAX_RECIPE_SERVINGS = 50
export const MAX_INGREDIENT_GRAMS = 10000
/** Unité d'une portion (« muffins ») : 1 à 24 caractères après trim. */
export const MAX_SERVING_UNIT_LENGTH = 24
export const SERVING_UNIT_MESSAGE = `L’unité d’une portion doit contenir entre 1 et ${MAX_SERVING_UNIT_LENGTH} caractères.`

/** Photo de produit : 300 ko, jpeg/png/webp. */
export const MAX_PHOTO_BYTES = 300 * 1024
export const PHOTO_MIMES: readonly PhotoMime[] = ['image/jpeg', 'image/png', 'image/webp']

export function isPhotoMime(v: unknown): v is PhotoMime {
  return typeof v === 'string' && (PHOTO_MIMES as readonly string[]).includes(v)
}
