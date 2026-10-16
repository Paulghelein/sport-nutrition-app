import { ValidationError, cacheOffFoodWithPhoto, findFoodByEan } from '../../db'
import { fetchOffPhoto, lookupOff, offProductToFood } from '../../domain/nutrition'
import type { Ean, Food, IsoDateTime, OffPhoto } from '../../types'

/** Résultat de `resolveScan`. */
export type ResolveScanResult =
  /** Aliment prêt (déjà en cache, ou tout juste enregistré avec sa photo éventuelle). */
  | { status: 'food'; food: Food }
  /** Produit inconnu ou incomplet : l'écran ouvre le formulaire de création pré-rempli. */
  | {
      status: 'form'
      origin: 'incomplete' | 'not_found'
      name?: string
      brand?: string
      packageG?: number
    }
  /** Réseau absent, délai dépassé, réponse illisible : « Réessayer ». */
  | { status: 'error'; message: string }
  /** Le signal a été interrompu : ne rien afficher. */
  | { status: 'aborted' }

/** Dépendances injectables (tests) ; par défaut : Dexie réelle et horloge système. */
export interface ResolveScanDeps {
  findFoodByEan: (ean: Ean) => Promise<Food | undefined>
  cacheOffFoodWithPhoto: (food: Food, photo: OffPhoto | null) => Promise<Food>
  now: () => IsoDateTime
}

const defaultDeps: ResolveScanDeps = {
  findFoodByEan,
  cacheOffFoodWithPhoto: (food, photo) => cacheOffFoodWithPhoto(food, photo),
  now: () => new Date().toISOString(),
}

/**
 * Enchaîne cache -> recherche Open Food Facts -> photo -> enregistrement (F4/F6).
 * - Produit déjà en base : aucun appel réseau (ni fiche ni photo).
 * - Produit trouvé : la photo (`imageUrl`) est récupérée ici, au moment du scan, puis stockée avec l'aliment ;
 *   échec de la photo = aliment enregistré sans photo (jamais d'erreur).
 * - Valeurs OFF refusées par la validation : `status: 'form'` (origin `incomplete`, avec nom, marque et contenance).
 * Le même `signal` annule la recherche et la photo. `fetchFn` est injecté (testable sans réseau).
 */
export async function resolveScan(
  ean: Ean,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
  deps: ResolveScanDeps = defaultDeps,
): Promise<ResolveScanResult> {
  const aborted = (): boolean => signal?.aborted === true
  const cached = await deps.findFoodByEan(ean)
  if (aborted()) return { status: 'aborted' }
  if (cached) return { status: 'food', food: cached }

  const res = await lookupOff(ean, fetchFn, signal ? { signal } : {})
  if (aborted()) return { status: 'aborted' }
  if (res.status === 'error') return { status: 'error', message: res.message }
  if (res.status !== 'found') {
    const form: ResolveScanResult = { status: 'form', origin: res.status }
    if (res.status === 'incomplete') {
      if (res.name) form.name = res.name
      if (res.brand) form.brand = res.brand
      if (res.packageG !== undefined) form.packageG = res.packageG
    }
    return form
  }

  const { product } = res
  const photo = product.imageUrl
    ? await fetchOffPhoto(product.imageUrl, fetchFn, signal ? { signal } : {})
    : null
  if (aborted()) return { status: 'aborted' }
  const toFood = offProductToFood(product, deps.now())
  try {
    let food: Food
    try {
      food = await deps.cacheOffFoodWithPhoto(toFood, photo)
    } catch (e) {
      // Photo refusée par la base : l'aliment compte plus que l'image, on réessaie sans photo.
      if (!(e instanceof ValidationError) || photo === null) throw e
      food = await deps.cacheOffFoodWithPhoto(toFood, null)
    }
    return aborted() ? { status: 'aborted' } : { status: 'food', food }
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e
    // Valeurs OFF incohérentes (ou photo refusée par la base) : formulaire pré-rempli plutôt qu'une impasse.
    if (aborted()) return { status: 'aborted' }
    const form: ResolveScanResult = { status: 'form', origin: 'incomplete', name: product.name }
    if (product.brand) form.brand = product.brand
    if (product.packageG !== undefined) form.packageG = product.packageG
    return form
  }
}
