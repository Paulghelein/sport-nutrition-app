// Open Food Facts (J7, SPEC §4.4) : seul appel réseau de l'app. Parsing défensif, sans dépendance lourde.
import type { IsoDateTime } from '../../types/common'
import type { Food, Per100g, PhotoMime } from '../../types/nutrition'
import type { Ean, OffLookupResult, OffPhoto, OffProduct } from '../../types/scan'

import { MAX_PHOTO_BYTES, isPhotoMime } from './limits'

/** Limite de `checkFoodInput` (src/db/validation.ts, MAX_FOOD_NAME_LENGTH). */
const MAX_NAME_LENGTH = 80

/** Chiffres seuls, longueur 8, 12 ou 13, clé de contrôle GS1 valide ; sinon null. UPC-A (12) → EAN-13 (`0` + code). */
export function normalizeEan(raw: string): Ean | null {
  const s = raw.replace(/\s+/g, '')
  if (!/^\d+$/.test(s) || ![8, 12, 13].includes(s.length)) return null
  const digits = s.split('').map(Number)
  const check = digits.pop() as number
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    // Poids 3 pour le chiffre le plus proche de la clé, en alternant.
    const fromRight = digits.length - 1 - i
    sum += (digits[i] as number) * (fromRight % 2 === 0 ? 3 : 1)
  }
  if ((10 - (sum % 10)) % 10 !== check) return null
  return s.length === 12 ? `0${s}` : s
}

type Json = Record<string, unknown>

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Nombre fini depuis un nombre ou une chaîne (« 12,5 »), sinon undefined. */
function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string') {
    const t = v.trim().replace(',', '.')
    if (t === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return undefined
    const n = Number(t)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function inRange(n: number | undefined, max: number): number | undefined {
  return n !== undefined && n >= 0 && n <= max ? n : undefined
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

const KJ_PER_KCAL = 4.184

const MAX_PACKAGE_G = 5000

/**
 * `product_quantity` en grammes. Unité absente, `g` ou `kg` (×1000) seulement : une contenance en `ml`, `cl` ou `l` (boissons, huiles) est
 * ignorée, car la densité est inconnue et « paquet entier » donnerait des grammes faux. 0 < v <= 5000.
 */
function parsePackageG(product: Json): number | undefined {
  const unit = text(product.product_quantity_unit).toLowerCase()
  if (unit !== '' && unit !== 'g' && unit !== 'kg') return undefined
  const raw = toNumber(product.product_quantity)
  const q = raw !== undefined && unit === 'kg' ? raw * 1000 : raw
  return q !== undefined && q > 0 && q <= MAX_PACKAGE_G ? q : undefined
}

const OFF_IMAGE_HOSTS: readonly string[] = ['images.openfoodfacts.org', 'static.openfoodfacts.org']

/** URL HTTPS (port par défaut, sans identifiants) sur `images.` ou `static.openfoodfacts.org` ; sinon undefined. */
function safeOffImageUrl(v: unknown): string | undefined {
  const raw = text(v)
  if (raw === '') return undefined
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return undefined
  }
  const host = u.hostname.toLowerCase()
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '') return undefined
  if (u.port !== '' || !OFF_IMAGE_HOSTS.includes(host)) return undefined
  return u.href
}

/** Extrait un produit d'une réponse `GET /api/v2/product/{ean}.json`. Ne renvoie jamais `cached`. */
export function parseOffProduct(ean: Ean, json: unknown): Exclude<OffLookupResult, { status: 'cached' }> {
  if (!isObject(json)) return { status: 'not_found', ean }
  const status = toNumber(json.status)
  const product = json.product
  if (status === 0 || !isObject(product)) return { status: 'not_found', ean }

  const name = (text(product.product_name) || text(product.product_name_fr) || text(product.generic_name))
    .slice(0, MAX_NAME_LENGTH)
    .trim()
  const brand = text(product.brands).split(',')[0]?.trim() ?? ''

  const n = isObject(product.nutriments) ? product.nutriments : {}
  let kcal = inRange(toNumber(n['energy-kcal_100g']), 900)
  if (kcal === undefined) {
    const kj = toNumber(n['energy_100g'])
    if (kj !== undefined && kj >= 0) kcal = inRange(kj / KJ_PER_KCAL, 900)
  }
  const protein = inRange(toNumber(n['proteins_100g']), 100)
  const carbs = inRange(toNumber(n['carbohydrates_100g']), 100)
  const fat = inRange(toNumber(n['fat_100g']), 100)
  const fiber = inRange(toNumber(n['fiber_100g']), 100)

  if (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) {
    const res: Extract<OffLookupResult, { status: 'incomplete' }> = { status: 'incomplete', ean }
    if (name) res.name = name
    if (brand) res.brand = brand
    return res
  }

  // Plausibilité : saisies OFF souvent fausses. Seuil prudent pour les fibres, polyols et alcool.
  const calc = 4 * protein + 4 * carbs + 9 * fat
  const diff = Math.abs(kcal - calc)
  if (protein + carbs + fat > 105 || (diff > 60 && diff > 0.4 * Math.max(kcal, calc))) {
    const res: Extract<OffLookupResult, { status: 'incomplete' }> = { status: 'incomplete', ean }
    if (name) res.name = name
    if (brand) res.brand = brand
    return res
  }

  const per100g: Per100g = { kcal, protein, carbs, fat }
  if (fiber !== undefined) per100g.fiber = fiber
  const out: OffProduct = { ean, name: name || `Produit ${ean}`, per100g }
  if (brand) out.brand = brand
  const serving = toNumber(product.serving_quantity)
  if (serving !== undefined && serving > 0 && serving <= 1000) out.servingG = serving
  const packageG = parsePackageG(product)
  if (packageG !== undefined) out.packageG = packageG
  const imageUrl = safeOffImageUrl(product.image_front_small_url)
  if (imageUrl !== undefined) out.imageUrl = imageUrl
  return { status: 'found', product: out }
}

/** Aliment à enregistrer en cache pour un produit trouvé. */
export function offProductToFood(product: OffProduct, now: IsoDateTime): Food {
  const food: Food = {
    id: `off-${product.ean}`,
    name: product.name,
    source: 'off',
    ean: product.ean,
    per100g: product.per100g,
    favorite: false,
    updatedAt: now,
  }
  if (product.brand) food.brand = product.brand
  if (product.servingG !== undefined) food.defaultPortionG = product.servingG
  if (product.packageG !== undefined) food.packageG = product.packageG
  return food
}

const OFF_FIELDS = 'code,product_name,product_name_fr,generic_name,brands,nutriments,serving_quantity,product_quantity,product_quantity_unit,image_front_small_url'

export function offProductUrl(ean: Ean): string {
  return `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=${OFF_FIELDS}`
}

export interface LookupOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

const MSG_OFFLINE = 'Pas de connexion. Réessaie plus tard ou saisis le produit à la main.'
const MSG_DOWN = 'Open Food Facts ne répond pas. Réessaie plus tard ou saisis le produit à la main.'

/**
 * Interroge Open Food Facts. `fetchFn` est injecté (testable). Aucun en-tête personnalisé, aucune donnée
 * personnelle : seul l'EAN est dans l'URL.
 */
export async function lookupOff(
  ean: Ean,
  fetchFn: typeof fetch,
  opts: LookupOptions = {},
): Promise<Exclude<OffLookupResult, { status: 'cached' }>> {
  const { timeoutMs = 8000, signal } = opts
  const controller = new AbortController()
  const onAbort = (): void => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(new Error('timeout'))
    }, timeoutMs)
  })
  const fail = (message: string): { status: 'error'; ean: Ean; message: string } => ({ status: 'error', ean, message })

  try {
    const work = (async () => {
      const res = await fetchFn(offProductUrl(ean), {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      })
      if (res.status === 404) return { status: 'not_found' as const, ean }
      if (!res.ok) return fail(MSG_DOWN)
      let data: unknown
      try {
        data = await res.json()
      } catch {
        return fail(MSG_DOWN)
      }
      return parseOffProduct(ean, data)
    })()
    work.catch(() => undefined) // évite un rejet non géré si le délai gagne la course
    return await Promise.race([work, timeout])
  } catch {
    if (timedOut) return fail(MSG_DOWN)
    if (signal?.aborted) return fail('Recherche annulée.')
    return fail(MSG_OFFLINE)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

// ---------- Photo du produit (F6) ----------

/** Corps de la réponse en `Blob`, lu par morceaux : null dès que `MAX_PHOTO_BYTES` est dépassé (repli `blob()` sans body, seulement si `Content-Length` est présent). */
async function readLimited(res: Response, mime: PhotoMime): Promise<Blob | null> {
  if (res.body === null || typeof res.body.getReader !== 'function') {
    // Sans flux, on ne lit le blob que si la taille est annoncée (et déjà contrôlée) : sinon rien ne borne la mémoire.
    if (res.headers.get('content-length') === null) return null
    const blob = await res.blob()
    return blob.size > 0 && blob.size <= MAX_PHOTO_BYTES ? blob : null
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_PHOTO_BYTES) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  return size > 0 ? new Blob(chunks as BlobPart[], { type: mime }) : null
}

/**
 * Télécharge la photo d'un produit (`OffProduct.imageUrl`). Revérifie l'URL (HTTPS, hôte OFF), lit le corps par morceaux et abandonne au-delà de la limite, refuse un statut
 * hors 2xx, un type hors jpeg/png/webp, plus de 300 ko (en-tête puis taille réelle) ou une redirection (qui
 * pourrait quitter l'hôte OFF). Ne lève jamais : `null` en cas d'échec, la photo étant facultative.
 */
export async function fetchOffPhoto(
  url: string,
  fetchFn: typeof fetch,
  opts: LookupOptions = {},
): Promise<OffPhoto | null> {
  const safe = safeOffImageUrl(url)
  if (safe === undefined) return null
  const { timeoutMs = 8000, signal } = opts
  const controller = new AbortController()
  const onAbort = (): void => controller.abort()
  if (signal?.aborted) return null
  signal?.addEventListener('abort', onAbort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(null)
    }, timeoutMs)
  })
  try {
    const work = (async (): Promise<OffPhoto | null> => {
      const res = await fetchFn(safe, {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
      })
      if (!res.ok) return null
      const mime = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
      if (!isPhotoMime(mime)) return null
      const declared = Number(res.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > MAX_PHOTO_BYTES) return null
      const blob = await readLimited(res, mime)
      return blob === null ? null : { mime, blob }
    })().catch(() => null)
    return await Promise.race([work, timeout])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
