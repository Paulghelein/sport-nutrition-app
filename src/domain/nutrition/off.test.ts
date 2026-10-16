import { describe, expect, it } from 'vitest'
import type { OffProduct } from '../../types/scan'
import { isPhotoMime, PHOTO_MIMES } from './limits'
import { fetchOffPhoto, lookupOff, normalizeEan, offProductToFood, offProductUrl, parseOffProduct } from './off'

const EAN = '3017620422003'

const full = {
  code: EAN,
  status: 1,
  product: {
    product_name: 'Nutella',
    brands: 'Ferrero, Nutella',
    serving_quantity: 15,
    nutriments: {
      'energy-kcal_100g': 539,
      energy_100g: 2252,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      fiber_100g: 0,
    },
  },
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('normalizeEan', () => {
  it('accepte EAN-13, EAN-8 et UPC-A valides', () => {
    expect(normalizeEan(EAN)).toBe(EAN)
    expect(normalizeEan('96385074')).toBe('96385074')
    expect(normalizeEan('036000291452')).toBe('0036000291452')
  })
  it('ignore les espaces, refuse clé fausse, longueur et non-chiffres', () => {
    expect(normalizeEan(' 3017 6204 22003 ')).toBe(EAN)
    expect(normalizeEan('3017620422004')).toBeNull()
    expect(normalizeEan('12345')).toBeNull()
    expect(normalizeEan('30176204220AB')).toBeNull()
    expect(normalizeEan('')).toBeNull()
  })
})

describe('parseOffProduct', () => {
  it('produit complet', () => {
    expect(parseOffProduct(EAN, full)).toEqual({
      status: 'found',
      product: {
        ean: EAN,
        name: 'Nutella',
        brand: 'Ferrero',
        per100g: { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, fiber: 0 },
        servingG: 15,
      },
    })
  })
  it('kJ seulement', () => {
    const r = parseOffProduct(EAN, {
      status: 1,
      product: { product_name: 'X', nutriments: { energy_100g: 1046, proteins_100g: 10, carbohydrates_100g: 30, fat_100g: 10 } },
    })
    expect(r.status).toBe('found')
    if (r.status === 'found') expect(r.product.per100g.kcal).toBeCloseTo(250, 5)
  })
  it('valeurs en chaîne, virgule décimale, repli du nom', () => {
    const r = parseOffProduct(EAN, {
      status: 1,
      product: {
        product_name: '',
        product_name_fr: 'Yaourt',
        serving_quantity: '125',
        nutriments: { 'energy-kcal_100g': '60', proteins_100g: '12,5', carbohydrates_100g: '4.2', fat_100g: '0' },
      },
    })
    expect(r).toMatchObject({
      status: 'found',
      product: { name: 'Yaourt', per100g: { kcal: 60, protein: 12.5, carbs: 4.2, fat: 0 }, servingG: 125 },
    })
  })
  it('sans nom : Produit <ean>', () => {
    const r = parseOffProduct(EAN, { status: 1, product: { nutriments: full.product.nutriments } })
    expect(r).toMatchObject({ status: 'found', product: { name: `Produit ${EAN}` } })
  })
  it('incomplet : macro manquante, valeur aberrante ou négative', () => {
    expect(
      parseOffProduct(EAN, { status: 1, product: { product_name: 'Y', brands: 'B', nutriments: { 'energy-kcal_100g': 100 } } }),
    ).toEqual({ status: 'incomplete', ean: EAN, name: 'Y', brand: 'B' })
    const bad = (n: Record<string, unknown>) =>
      parseOffProduct(EAN, { status: 1, product: { nutriments: { ...full.product.nutriments, ...n } } })
    expect(bad({ fat_100g: 130 }).status).toBe('incomplete')
    expect(bad({ proteins_100g: -1 }).status).toBe('incomplete')
    expect(bad({ fat_100g: 'abc' }).status).toBe('incomplete')
    expect(bad({ 'energy-kcal_100g': 1200, energy_100g: 5000 }).status).toBe('incomplete')
    expect(parseOffProduct(EAN, { status: 1, product: {} })).toEqual({ status: 'incomplete', ean: EAN })
  })
  it('plausibilité : somme > 105 g, kcal incohérentes, nom tronqué', () => {
    const p = (n: Record<string, unknown>, name = 'N') =>
      parseOffProduct(EAN, { status: 1, product: { product_name: name, nutriments: { ...full.product.nutriments, ...n } } })
    expect(p({ proteins_100g: 50, carbohydrates_100g: 50, fat_100g: 10 }).status).toBe('incomplete')
    expect(p({ 'energy-kcal_100g': 50 }).status).toBe('incomplete')
    expect(p({ 'energy-kcal_100g': 560 }).status).toBe('found')
    const long = p({ proteins_100g: 50, carbohydrates_100g: 50, fat_100g: 10 }, 'x'.repeat(200))
    expect(long).toMatchObject({ name: 'x'.repeat(80) })
    const ok = p({}, 'y'.repeat(200))
    expect(ok.status === 'found' && ok.product.name.length).toBe(80)
  })
  it('fibres aberrantes ignorées, portion incohérente ignorée', () => {
    const r = parseOffProduct(EAN, {
      status: 1,
      product: { product_name: 'Z', serving_quantity: 5000, nutriments: { ...full.product.nutriments, fiber_100g: -2 } },
    })
    expect(r.status === 'found' && r.product.servingG).toBeFalsy()
    expect(r.status === 'found' && r.product.per100g.fiber).toBeUndefined()
  })
  it('status 0, product absent, JSON inattendu : not_found', () => {
    expect(parseOffProduct(EAN, { status: 0, status_verbose: 'product not found' })).toEqual({ status: 'not_found', ean: EAN })
    expect(parseOffProduct(EAN, { status: 1 })).toEqual({ status: 'not_found', ean: EAN })
    expect(parseOffProduct(EAN, null)).toEqual({ status: 'not_found', ean: EAN })
    expect(parseOffProduct(EAN, [])).toEqual({ status: 'not_found', ean: EAN })
  })
})

describe('offProductToFood', () => {
  it('construit un aliment OFF', () => {
    const r = parseOffProduct(EAN, full)
    if (r.status !== 'found') throw new Error('attendu found')
    expect(offProductToFood(r.product, '2026-10-16T10:00:00.000Z')).toEqual({
      id: `off-${EAN}`,
      name: 'Nutella',
      source: 'off',
      ean: EAN,
      brand: 'Ferrero',
      per100g: r.product.per100g,
      defaultPortionG: 15,
      favorite: false,
      updatedAt: '2026-10-16T10:00:00.000Z',
    })
  })
})

describe('lookupOff', () => {
  it('trouvé, URL sans en-tête personnalisé', async () => {
    let seen: { url: string; init?: RequestInit } | undefined
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init }
      return jsonResponse(full)
    }) as typeof fetch
    const r = await lookupOff(EAN, f)
    expect(r.status).toBe('found')
    expect(seen?.url).toBe(offProductUrl(EAN))
    expect(seen?.url).toContain('https://world.openfoodfacts.org/api/v2/product/')
    expect(seen?.init?.headers).toBeUndefined()
    expect(seen?.init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
  })
  it('404 : not_found', async () => {
    expect(await lookupOff(EAN, (async () => jsonResponse({}, 404)) as typeof fetch)).toEqual({ status: 'not_found', ean: EAN })
  })
  it('status 0 : not_found', async () => {
    expect((await lookupOff(EAN, (async () => jsonResponse({ status: 0 })) as typeof fetch)).status).toBe('not_found')
  })
  it('HTTP 500 et JSON illisible : error', async () => {
    const r1 = await lookupOff(EAN, (async () => jsonResponse({}, 500)) as typeof fetch)
    expect(r1).toMatchObject({ status: 'error' })
    const r2 = await lookupOff(EAN, (async () => new Response('<html>', { status: 200 })) as typeof fetch)
    expect(r2).toMatchObject({ status: 'error', message: expect.stringContaining('Open Food Facts ne répond pas') })
  })
  it('réseau en échec : Pas de connexion', async () => {
    const r = await lookupOff(EAN, (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch)
    expect(r).toMatchObject({ status: 'error', message: expect.stringContaining('Pas de connexion') })
  })
  it('délai dépassé via AbortController', async () => {
    const f = ((_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
      })) as typeof fetch
    const r = await lookupOff(EAN, f, { timeoutMs: 20 })
    expect(r).toMatchObject({ status: 'error', message: expect.stringContaining('ne répond pas') })
  })
  it('délai dépassé même si fetch ignore le signal', async () => {
    const f = (() => new Promise<Response>(() => undefined)) as typeof fetch
    expect((await lookupOff(EAN, f, { timeoutMs: 20 })).status).toBe('error')
  })
  it('signal externe annulé', async () => {
    const ac = new AbortController()
    ac.abort()
    const f = ((_u: unknown, init?: RequestInit) =>
      init?.signal?.aborted ? Promise.reject(new DOMException('a', 'AbortError')) : Promise.resolve(jsonResponse(full))) as typeof fetch
    expect(await lookupOff(EAN, f, { signal: ac.signal })).toMatchObject({ status: 'error', message: 'Recherche annulée.' })
  })
})

describe('OFF : paquet et photo', () => {
  const withProduct = (extra: Record<string, unknown>) => ({ ...full, product: { ...full.product, ...extra } })
  const parse = (extra: Record<string, unknown>) => {
    const r = parseOffProduct(EAN, withProduct(extra))
    return r.status === 'found' ? r.product : null
  }
  it('packageG : g ou unité absente, bornes, ml ignoré', () => {
    expect(parse({ product_quantity: '250' })?.packageG).toBe(250)
    expect(parse({ product_quantity: 500, product_quantity_unit: 'g' })?.packageG).toBe(500)
    expect(parse({ product_quantity: 500, product_quantity_unit: 'ml' })?.packageG).toBeUndefined()
    expect(parse({ product_quantity: 1.5, product_quantity_unit: 'kg' })?.packageG).toBe(1500)
    expect(parse({ product_quantity: 6, product_quantity_unit: 'kg' })?.packageG).toBeUndefined()
    for (const u of ['cl', 'l']) expect(parse({ product_quantity: 5, product_quantity_unit: u })?.packageG).toBeUndefined()
    expect(parse({ product_quantity: 0 })?.packageG).toBeUndefined()
    expect(parse({ product_quantity: 5001 })?.packageG).toBeUndefined()
    expect(parse({ product_quantity: 5000 })?.packageG).toBe(5000)
    expect(parse({})?.packageG).toBeUndefined()
  })
  it('imageUrl : HTTPS sur openfoodfacts.org uniquement', () => {
    const ok = 'https://images.openfoodfacts.org/images/products/301/front_fr.100.400.jpg'
    expect(parse({ image_front_small_url: ok })?.imageUrl).toBe(ok)
    expect(parse({ image_front_small_url: 'https://static.openfoodfacts.org/a.jpg' })?.imageUrl).toBeDefined()
    for (const bad of ['http://images.openfoodfacts.org/a.jpg', 'https://evilopenfoodfacts.org/a.jpg', 'https://openfoodfacts.org.evil.com/a.jpg', 'https://images.openfoodfacts.org:8443/a.jpg', 'https://openfoodfacts.org/a.jpg', 'https://world.openfoodfacts.org/a.jpg', 'https://user@images.openfoodfacts.org/a.jpg', 'nope', 42]) {
      expect(parse({ image_front_small_url: bad })?.imageUrl).toBeUndefined()
    }
  })
  it('offProductToFood reporte packageG', () => {
    const r = parse({ product_quantity: 250 })
    expect(offProductToFood(r as OffProduct, 'now').packageG).toBe(250)
  })
  it('OFF_FIELDS demande les nouveaux champs', () => {
    expect(offProductUrl(EAN)).toContain('product_quantity,product_quantity_unit,image_front_small_url')
  })

  const URL_OK = 'https://images.openfoodfacts.org/a.jpg'
  const img = (size: number, type = 'image/jpeg', status = 200, headers: Record<string, string> = {}) =>
    (async () => new Response(new Uint8Array(size), { status, headers: { 'content-type': type, ...headers } })) as typeof fetch
  it('fetchOffPhoto : succès et options de requête', async () => {
    let init: RequestInit | undefined
    const f = (async (_u: unknown, i?: RequestInit) => {
      init = i
      return new Response(new Uint8Array(1000), { headers: { 'content-type': 'image/webp; charset=x' } })
    }) as typeof fetch
    const p = await fetchOffPhoto(URL_OK, f)
    expect(p?.mime).toBe('image/webp')
    expect(p?.blob.size).toBe(1000)
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
  })
  it('fetchOffPhoto : refus', async () => {
    expect(await fetchOffPhoto('https://evil.com/a.jpg', img(10))).toBeNull()
    expect(await fetchOffPhoto('http://images.openfoodfacts.org/a.jpg', img(10))).toBeNull()
    expect(await fetchOffPhoto(URL_OK, img(10, 'image/jpeg', 404))).toBeNull()
    expect(await fetchOffPhoto(URL_OK, img(10, 'image/svg+xml'))).toBeNull()
    expect(await fetchOffPhoto(URL_OK, img(10, 'text/html'))).toBeNull()
    expect(await fetchOffPhoto(URL_OK, img(300 * 1024 + 1))).toBeNull()
    expect(await fetchOffPhoto(URL_OK, img(10, 'image/png', 200, { 'content-length': '999999' }))).toBeNull()
    expect(await fetchOffPhoto(URL_OK, img(0))).toBeNull()
    expect((await fetchOffPhoto(URL_OK, img(300 * 1024)))?.blob.size).toBe(300 * 1024)
  })
  it('packageG : kg converti, cl ignoré, unité G acceptée sans casse', () => {
    expect(parse({ product_quantity: 1, product_quantity_unit: 'kg' })?.packageG).toBe(1000)
    expect(parse({ product_quantity: 33, product_quantity_unit: 'cl' })?.packageG).toBeUndefined()
    expect(parse({ product_quantity: 250, product_quantity_unit: 'G' })?.packageG).toBe(250)
  })
  it('fetchOffPhoto : redirection refusée (redirect error) et rejet réseau -> null', async () => {
    let init: RequestInit | undefined
    const f = (async (_u: unknown, i?: RequestInit) => {
      init = i
      throw new TypeError('redirect mode is set to error')
    }) as typeof fetch
    expect(await fetchOffPhoto(URL_OK, f)).toBeNull()
    expect(init?.redirect).toBe('error')
  })
  it('fetchOffPhoto : abandonne le flux dès que la limite est dépassée', async () => {
    let pulled = 0
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++
        c.enqueue(new Uint8Array(100 * 1024))
      },
      cancel() {
        cancelled = true
      },
    })
    const f = (async () => new Response(stream, { headers: { 'content-type': 'image/png' } })) as typeof fetch
    expect(await fetchOffPhoto(URL_OK, f)).toBeNull()
    expect(cancelled).toBe(true)
    expect(pulled).toBeLessThan(10)
  })
  it('fetchOffPhoto : sans flux, blob() seulement si Content-Length présent', async () => {
    const mk = (headers: Record<string, string>) =>
      (async () => {
        const r = new Response(new Uint8Array(10), { headers: { 'content-type': 'image/png', ...headers } })
        Object.defineProperty(r, 'body', { value: null })
        return r
      }) as typeof fetch
    expect(await fetchOffPhoto(URL_OK, mk({}))).toBeNull()
    expect((await fetchOffPhoto(URL_OK, mk({ 'content-length': '10' })))?.blob.size).toBe(10)
  })
  it('isPhotoMime', () => {
    expect(PHOTO_MIMES.every(isPhotoMime)).toBe(true)
    expect(isPhotoMime('image/gif')).toBe(false)
    expect(isPhotoMime(3)).toBe(false)
  })
  it('fetchOffPhoto : réseau, délai, signal : null sans lever', async () => {
    expect(await fetchOffPhoto(URL_OK, (async () => { throw new TypeError('x') }) as typeof fetch)).toBeNull()
    expect(await fetchOffPhoto(URL_OK, (() => new Promise<Response>(() => undefined)) as typeof fetch, { timeoutMs: 20 })).toBeNull()
    const ac = new AbortController()
    ac.abort()
    expect(await fetchOffPhoto(URL_OK, img(10), { signal: ac.signal })).toBeNull()
  })
})
