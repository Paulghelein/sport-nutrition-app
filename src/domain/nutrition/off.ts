// Open Food Facts (J7, SPEC §4.4) : seul appel réseau de l'app. Parsing défensif, sans dépendance lourde.
import type { IsoDateTime } from '../../types/common'
import type { Food, Per100g } from '../../types/nutrition'
import type { Ean, OffLookupResult, OffProduct } from '../../types/scan'

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
  return food
}

const OFF_FIELDS = 'code,product_name,product_name_fr,generic_name,brands,nutriments,serving_quantity'

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
