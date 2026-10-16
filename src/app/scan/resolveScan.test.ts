import { describe, expect, it, vi } from 'vitest'
import type { Food, OffPhoto } from '../../types'
import { ValidationError } from '../../db'
import { resolveScan } from './resolveScan'
import type { ResolveScanDeps } from './resolveScan'

const EAN = '3017620422003'
const IMG = 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.3.200.jpg'
const NOW = '2026-01-01T00:00:00.000Z'

const offJson = (extra: Record<string, unknown> = {}) => ({
  status: 1,
  product: {
    product_name: 'Pâte test',
    nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6, carbohydrates_100g: 57, fat_100g: 31 },
    ...extra,
  },
})

function makeFetch(photo: 'ok' | 'fail', json: unknown = offJson({ image_front_small_url: IMG })) {
  const calls: string[] = []
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('/api/v2/product/')) return Promise.resolve(Response.json(json))
    if (photo === 'fail') return Promise.resolve(new Response('no', { status: 500 }))
    return Promise.resolve(
      new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'content-type': 'image/jpeg' } }),
    )
  })
  return { fetchFn: fn as unknown as typeof fetch, calls }
}

function makeDeps(cached?: Food) {
  const saved: { food: Food; photo: OffPhoto | null }[] = []
  const deps: ResolveScanDeps = {
    findFoodByEan: () => Promise.resolve(cached),
    cacheOffFoodWithPhoto: (food, photo) => {
      saved.push({ food, photo })
      return Promise.resolve(food)
    },
    now: () => NOW,
  }
  return { deps, saved }
}

describe('resolveScan', () => {
  it('produit trouvé : récupère la photo et l’enregistre avec l’aliment', async () => {
    const { fetchFn, calls } = makeFetch('ok')
    const { deps, saved } = makeDeps()
    const res = await resolveScan(EAN, fetchFn, undefined, deps)
    expect(res.status).toBe('food')
    expect(calls).toHaveLength(2)
    expect(calls[1]).toBe(IMG)
    expect(saved).toHaveLength(1)
    expect(saved[0]?.food.id).toBe(`off-${EAN}`)
    expect(saved[0]?.photo?.mime).toBe('image/jpeg')
  })

  it('photo en échec : aliment enregistré sans photo', async () => {
    const { fetchFn } = makeFetch('fail')
    const { deps, saved } = makeDeps()
    const res = await resolveScan(EAN, fetchFn, undefined, deps)
    expect(res.status).toBe('food')
    expect(saved[0]?.photo).toBeNull()
  })

  it('pas d’imageUrl : aucun appel photo', async () => {
    const { fetchFn, calls } = makeFetch('ok', offJson())
    const { deps, saved } = makeDeps()
    await resolveScan(EAN, fetchFn, undefined, deps)
    expect(calls).toHaveLength(1)
    expect(saved[0]?.photo).toBeNull()
  })

  it('produit en cache : aucun appel réseau', async () => {
    const { fetchFn, calls } = makeFetch('ok')
    const cached: Food = {
      id: `off-${EAN}`,
      name: 'x',
      source: 'off',
      ean: EAN,
      per100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 },
      favorite: false,
      updatedAt: NOW,
    }
    const { deps, saved } = makeDeps(cached)
    const res = await resolveScan(EAN, fetchFn, undefined, deps)
    expect(res).toEqual({ status: 'food', food: cached })
    expect(calls).toHaveLength(0)
    expect(saved).toHaveLength(0)
  })

  it('signal interrompu avant l’enregistrement : rien n’est écrit', async () => {
    const ctrl = new AbortController()
    const { fetchFn } = makeFetch('ok')
    const { deps, saved } = makeDeps()
    const wrapped = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === IMG) ctrl.abort()
      return fetchFn(input, init)
    }) as typeof fetch
    const res = await resolveScan(EAN, wrapped, ctrl.signal, deps)
    expect(res.status).toBe('aborted')
    expect(saved).toHaveLength(0)
  })

  it('produit incomplet : formulaire avec nom, marque et contenance', async () => {
    const { fetchFn } = makeFetch('ok', {
      status: 1,
      product: {
        product_name: 'Barre',
        brands: 'Marque',
        product_quantity: '180',
        product_quantity_unit: 'g',
        nutriments: {},
      },
    })
    const { deps } = makeDeps()
    expect(await resolveScan(EAN, fetchFn, undefined, deps)).toEqual({
      status: 'form',
      origin: 'incomplete',
      name: 'Barre',
      brand: 'Marque',
      packageG: 180,
    })
  })
  it('produit inconnu : formulaire not_found', async () => {
    const { fetchFn } = makeFetch('ok', { status: 0 })
    const { deps } = makeDeps()
    expect(await resolveScan(EAN, fetchFn, undefined, deps)).toEqual({ status: 'form', origin: 'not_found' })
  })

  it('photo refusée par la base : réessaie l’aliment sans photo', async () => {
    const { fetchFn } = makeFetch('ok')
    const saved: (OffPhoto | null)[] = []
    const deps: ResolveScanDeps = {
      findFoodByEan: () => Promise.resolve(undefined),
      cacheOffFoodWithPhoto: (food, photo) => {
        saved.push(photo)
        return photo ? Promise.reject(new ValidationError('Photo invalide')) : Promise.resolve(food)
      },
      now: () => NOW,
    }
    const res = await resolveScan(EAN, fetchFn, undefined, deps)
    expect(res.status).toBe('food')
    expect(saved).toHaveLength(2)
    expect(saved[1]).toBeNull()
  })
})
