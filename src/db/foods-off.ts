// Cache des produits Open Food Facts et recherche par code-barres (J7). Le domaine construit le `Food` depuis `OffProduct`.
import type { Ean, Food } from '../types'
import { db } from './database'
import { ValidationError } from './repositories'
import { foodSchema } from './schemas'
import { checkFoodInput } from './validation'

/** Ligne `foods` portant ce code-barres (toute source) ; la plus récemment modifiée s'il y en a plusieurs. */
export async function findFoodByEan(ean: Ean): Promise<Food | undefined> {
  const rows = await db.foods.where('ean').equals(ean).toArray()
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

/**
 * Enregistre un produit OFF sous l'id `off-<ean>`. Si un aliment personnel porte déjà ce code-barres, il n'est pas
 * écrasé et il est renvoyé. Une ligne OFF existante est rafraîchie en gardant son favori.
 */
export async function cacheOffFood(food: Food): Promise<Food> {
  if (food.source !== 'off' || food.ean === undefined || food.id !== `off-${food.ean}`) {
    throw new ValidationError('Produit Open Food Facts invalide.')
  }
  const { ean } = food
  if (!foodSchema.safeParse(food).success) throw new ValidationError('Produit Open Food Facts invalide.')
  const rule = checkFoodInput(food)
  if (rule !== null) throw new ValidationError(rule)
  return db.transaction('rw', db.foods, async () => {
    const same = await db.foods.where('ean').equals(ean).toArray()
    const user = same.find((f) => f.source === 'user')
    if (user) return user
    const previous = same.find((f) => f.id === food.id)
    const row: Food = previous ? { ...food, favorite: previous.favorite } : food
    await db.foods.put(row)
    return row
  })
}
