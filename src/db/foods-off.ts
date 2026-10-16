// Cache des produits Open Food Facts et recherche par code-barres (J7). Le domaine construit le `Food` depuis `OffProduct`.
import type { Ean, Food, FoodPhoto, Id, IsoDateTime, OffPhoto, PhotoMime } from '../types'
import { MAX_PHOTO_BYTES, isPhotoMime } from '../domain/nutrition/limits'
import { db } from './database'
import { nowIso } from './helpers'
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

// ---------- Photos des produits (F6) ----------
// Aucun appel réseau ici : la photo arrive déjà récupérée (`fetchOffPhoto`, domaine).

/** Lit les octets d'un Blob (repli FileReader si `arrayBuffer` est absent). Toujours AVANT d'ouvrir une transaction. */
async function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Lecture de la photo impossible.'))
    reader.readAsArrayBuffer(blob)
  })
}

/**
 * Contrôle commun (mime et taille) puis lecture des octets : l'écriture en base refuse ce que l'import de sauvegarde
 * refuserait. Stocker des `ArrayBuffer` et non des Blob : WebKit refuse les Blob dans IndexedDB en session éphémère.
 */
async function checkedBytes(photo: OffPhoto): Promise<ArrayBuffer> {
  if (!isPhotoMime(photo.mime)) throw new ValidationError('Photo invalide : format non pris en charge.')
  const bytes = await readBytes(photo.blob)
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new ValidationError('Photo invalide : taille hors limites (300 ko maximum).')
  }
  return bytes
}

function photoRow(foodId: Id, mime: PhotoMime, bytes: ArrayBuffer, now: IsoDateTime): FoodPhoto {
  return { foodId, mime, bytes, fetchedAt: now }
}

/** Enregistre (ou remplace) la photo d'un aliment existant. */
export async function saveFoodPhoto(
  foodId: Id,
  photo: OffPhoto,
  now: IsoDateTime = nowIso(),
): Promise<FoodPhoto> {
  const bytes = await checkedBytes(photo)
  return db.transaction('rw', [db.foods, db.foodPhotos], async () => {
    const food = await db.foods.get(foodId)
    if (!food) throw new ValidationError('Aliment introuvable.')
    if (food.source === 'ciqual') throw new ValidationError('Un aliment Ciqual n’a pas de photo.')
    const row = photoRow(foodId, photo.mime, bytes, now)
    await db.foodPhotos.put(row)
    return row
  })
}

export async function getFoodPhoto(foodId: Id): Promise<FoodPhoto | undefined> {
  return db.foodPhotos.get(foodId)
}

/** Photos d'une liste d'aliments : Map `foodId` -> photo (les aliments sans photo sont absents). */
export async function getFoodPhotos(foodIds: readonly Id[]): Promise<Map<Id, FoodPhoto>> {
  const rows = await db.foodPhotos.bulkGet([...foodIds])
  const map = new Map<Id, FoodPhoto>()
  for (const r of rows) if (r) map.set(r.foodId, r)
  return map
}

/** Supprime la photo d'un aliment (sans erreur si absente). */
export async function deleteFoodPhoto(foodId: Id): Promise<void> {
  await db.foodPhotos.delete(foodId)
}

/**
 * Comme `cacheOffFood`, avec la photo, dans la même transaction. Photo `null` : l'aliment est écrit sans toucher à
 * une photo déjà stockée. Si un aliment personnel porte le même EAN, il gagne (il est renvoyé, pas écrasé) et la
 * photo lui est rattachée seulement s'il n'en a pas encore : la photo du produit scanné illustre alors l'aliment
 * que l'utilisateur voit ; une photo déjà présente n'est jamais remplacée.
 */
export async function cacheOffFoodWithPhoto(
  food: Food,
  photo: OffPhoto | null,
  now: IsoDateTime = nowIso(),
): Promise<Food> {
  const bytes = photo === null ? null : await checkedBytes(photo)
  return db.transaction('rw', [db.foods, db.foodPhotos], async () => {
    const row = await cacheOffFood(food)
    if (photo !== null && bytes !== null) {
      if (row.source === 'user') {
        if (!(await db.foodPhotos.get(row.id))) await db.foodPhotos.put(photoRow(row.id, photo.mime, bytes, now))
      } else {
        await db.foodPhotos.put(photoRow(row.id, photo.mime, bytes, now))
      }
    }
    return row
  })
}
