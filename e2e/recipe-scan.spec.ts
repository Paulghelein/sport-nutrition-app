import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding } from './helpers.ts'

// F4 « Recette par scan » : produits saisis par leur code (la caméra n'existe pas en test), OFF et images interceptés.
// Le service worker masquerait `page.route` : on le bloque.
test.use({ serviceWorkers: 'block' })

const LARDONS = '3228857000166'
const EMMENTAL = '3760012345670'
const FROMAGE_BLANC = '4006381333931'
const UNKNOWN = '5449000000996'
const DRAFT_KEY = 'forge.recipeScanDraft.v1'
const CORS = { 'access-control-allow-origin': '*' }
/** Octets JPEG factices (SOI + JFIF + EOI) : le contenu n'a pas besoin d'être décodable. */
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x03, 0xff, 0xd9,
])

const nutriments = (kcal: number, p: number, c: number, f: number) => ({
  'energy-kcal_100g': kcal,
  proteins_100g: p,
  carbohydrates_100g: c,
  fat_100g: f,
})

const PRODUCTS: Record<string, unknown> = {
  [LARDONS]: {
    product_name: 'Lardons fumés',
    brands: 'Marque Test',
    product_quantity: 150,
    product_quantity_unit: 'g',
    image_front_small_url: `https://images.openfoodfacts.org/images/products/322/885/700/0166/front_fr.100.jpg`,
    nutriments: nutriments(250, 17, 1, 20),
  },
  [EMMENTAL]: {
    product_name: 'Emmental râpé',
    brands: 'Marque Test',
    serving_quantity: 30,
    nutriments: nutriments(380, 28, 1, 30),
  },
  [FROMAGE_BLANC]: {
    product_name: 'Fromage blanc nature',
    brands: 'Marque Test',
    serving_quantity: 100,
    nutriments: nutriments(75, 8, 4, 3),
  },
}

async function mockOff(page: Page): Promise<{ apiCalls: () => number }> {
  let calls = 0
  await page.route(/world\.openfoodfacts\.org/, (route) => {
    calls++
    const url = route.request().url()
    const ean = Object.keys(PRODUCTS).find((e) => url.includes(e))
    return route.fulfill({
      headers: CORS,
      json: ean ? { status: 1, product: PRODUCTS[ean] } : { status: 0 },
    })
  })
  await page.route(/images\.openfoodfacts\.org/, (route) =>
    route.fulfill({ headers: { ...CORS, 'content-type': 'image/jpeg' }, body: JPEG }),
  )
  return { apiCalls: () => calls }
}

/** Sans caméra : un goto pendant une demande getUserMedia en attente bloque WebKit headless. */
async function noCamera(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
  })
}

async function openScreen(page: Page) {
  await page.goto('./')
  await completeOnboarding(page)
  await page.waitForLoadState('networkidle')
  await page.goto('./nutrition/recette-scan')
  await expect(page.getByRole('heading', { name: 'Recette par scan' })).toBeVisible()
}

async function typeCode(page: Page, code: string) {
  await page.getByRole('button', { name: 'Saisir un code' }).click()
  const sheet = page.getByRole('dialog', { name: 'Saisir un code' })
  await sheet.getByLabel('Code-barres').fill(code)
  await sheet.getByRole('button', { name: 'Chercher ce produit' }).click()
  await expect(sheet).toBeHidden()
}

const list = (page: Page) => page.getByRole('region', { name: 'Ingrédients' })

async function readPhoto(page: Page, ean: string) {
  return page.evaluate(async (ean) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('forge')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const row = await new Promise<{ bytes: ArrayBuffer; mime: string } | undefined>((resolve, reject) => {
      const req = db.transaction('foodPhotos', 'readonly').objectStore('foodPhotos').get(`off-${ean}`)
      req.onsuccess = () => resolve(req.result as { bytes: ArrayBuffer; mime: string } | undefined)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return row ? { mime: row.mime, size: row.bytes.byteLength } : null
  }, ean)
}

test('recette par scan : egg muffins, brouillon conservé au rechargement, 6 portions au frigo, photo stockée', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await noCamera(page)
  const off = await mockOff(page)
  await openScreen(page)

  // Trois produits par leur code ; le premier a une contenance (paquet entier) et une photo.
  await typeCode(page, LARDONS)
  await expect(list(page).getByText('Lardons fumés')).toBeVisible()
  await expect(list(page).getByText('scanné · paquet entier')).toBeVisible()
  await expect(list(page).getByRole('button', { name: /^Quantité de Lardons fumés : 150 g/ })).toBeVisible()
  await typeCode(page, EMMENTAL)
  await expect(list(page).getByRole('button', { name: /^Quantité de Emmental râpé : 30 g/ })).toBeVisible()
  await typeCode(page, FROMAGE_BLANC)
  await expect(list(page).getByText('Fromage blanc nature')).toBeVisible()
  expect(off.apiCalls()).toBe(3)
  // 1 portion : 150 g x 2,5 + 30 g x 3,8 + 100 g x 0,75 = 564 kcal ; protéines 25,5 + 8,4 + 8 = 41,9 g.
  await expect(page.getByLabel('Macros par portion')).toContainText('564 kcal')
  await expect(page.getByLabel('Macros par portion')).toContainText('P 42 g')

  // Même code relu : pas de doublon, message, aucun appel réseau.
  await typeCode(page, LARDONS)
  await expect(page.getByText('Déjà dans la liste : Lardons fumés')).toBeVisible()
  await expect(list(page).getByRole('listitem')).toHaveCount(3)
  expect(off.apiCalls()).toBe(3)

  // Un aliment Ciqual cherché.
  await page.getByRole('button', { name: 'Chercher un aliment' }).click()
  const search = page.getByRole('dialog', { name: 'Chercher un aliment' })
  await search.getByRole('searchbox', { name: 'Rechercher un aliment' }).fill('oeuf')
  const first = search.getByRole('list', { name: 'Résultats' }).getByRole('button').first()
  await expect(first).toBeVisible({ timeout: 20_000 })
  await first.click()
  await expect(search).toBeHidden()
  await expect(list(page).getByRole('listitem')).toHaveCount(4)
  await expect(list(page).getByText('Ciqual')).toBeVisible()

  // Quantité modifiée : 30 g -> 80 g.
  await list(page)
    .getByRole('button', { name: /^Quantité de Emmental râpé/ })
    .click()
  const grams = page.getByRole('dialog', { name: 'Emmental râpé' })
  await grams.getByLabel('Quantité').fill('80')
  await grams.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(list(page).getByRole('button', { name: /^Quantité de Emmental râpé : 80 g/ })).toBeVisible()

  await page.getByLabel('Nom de la recette').fill('Egg muffins')
  await expect(page.getByLabel('Macros par portion')).toContainText('kcal')

  // Rechargement : le brouillon (nom, 4 ingrédients, quantité modifiée) est intact.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Recette par scan' })).toBeVisible()
  await expect(page.getByLabel('Nom de la recette')).toHaveValue('Egg muffins')
  await expect(list(page).getByRole('listitem')).toHaveCount(4)
  await expect(list(page).getByRole('button', { name: /^Quantité de Emmental râpé : 80 g/ })).toBeVisible()
  await expect(list(page).getByText('scanné · paquet entier')).toBeVisible()

  // « Ça donne 6 muffins ».
  const plus = page.getByRole('button', { name: 'Une portion de plus' })
  for (let i = 0; i < 5; i++) await plus.click()
  await page.getByRole('button', { name: /^Ça donne 6 portions/ }).click()
  const servings = page.getByRole('dialog', { name: 'Portions' })
  await servings.getByLabel('Unité').fill('muffins')
  await servings.getByRole('button', { name: 'Terminé' }).click()
  await expect(page.getByRole('button', { name: /^Ça donne 6 muffins/ })).toBeVisible()

  // Création : fiche de la recette, puis 6 portions au frigo.
  await page.getByRole('button', { name: 'Créer et mettre 6 portions au frigo' }).click()
  await expect(page).toHaveURL(/\/nutrition\/recettes\/[^/]+$/)
  await expect(page.getByRole('heading', { name: 'Egg muffins' })).toBeVisible()
  expect(await page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY)).toBeNull()
  // L'unité libre est affichée sur la fiche : « 6 muffins », pas « 6 portions ».
  await expect(page.getByText(/6 muffins/).first()).toBeVisible()
  await expect(page.getByText(/6 portions/)).toHaveCount(0)

  await page.goto('./nutrition/frigo')
  await expect(page.getByRole('heading', { name: 'Egg muffins' })).toBeVisible()
  await expect(page.getByTestId('fridge-left')).toContainText('6')

  // La photo du produit scanné est stockée (hors ligne ensuite).
  expect(await readPhoto(page, LARDONS)).toEqual({ mime: 'image/jpeg', size: JPEG.length })

  expect(errors.filter((e) => !e.includes('Failed to load resource'))).toEqual([])
})

test('recette par scan : 0 portion au frigo = « Créer la recette » ; « Tout effacer » vide le brouillon', async ({
  page,
}) => {
  await noCamera(page)
  await mockOff(page)
  await openScreen(page)
  await typeCode(page, FROMAGE_BLANC)
  await expect(list(page).getByText('Fromage blanc nature')).toBeVisible()

  // Sans nom : l'erreur de validation s'affiche, rien n'est créé.
  await page.getByRole('button', { name: 'Créer et mettre 1 portion au frigo' }).click()
  await expect(page.getByText('Donne un nom à la recette.')).toBeVisible()

  await page.getByLabel('Nom de la recette').fill('Dessert test')
  await page.getByRole('button', { name: /^Ça donne 1 portion/ }).click()
  const servings = page.getByRole('dialog', { name: 'Portions' })
  await servings.getByRole('button', { name: 'Diminuer : Portions au frigo' }).click()
  await servings.getByRole('button', { name: 'Terminé' }).click()
  await page.getByRole('button', { name: 'Créer la recette' }).click()
  await expect(page).toHaveURL(/\/nutrition\/recettes\/[^/]+$/)
  await expect(page.getByRole('heading', { name: 'Dessert test' })).toBeVisible()
  await page.goto('./nutrition/frigo')
  await expect(page.getByRole('heading', { name: 'Frigo' })).toBeVisible()
  // État chargé : le frigo vide propose de voir les recettes.
  await expect(page.getByRole('link', { name: 'Voir les recettes' })).toBeVisible()
  await expect(page.getByText('Dessert test')).toBeHidden()

  // Tout effacer (avec confirmation).
  await page.goto('./nutrition/recette-scan')
  await typeCode(page, EMMENTAL)
  await expect(list(page).getByText('Emmental râpé')).toBeVisible()
  await page.getByRole('button', { name: 'Tout effacer' }).click()
  await page
    .getByRole('dialog', { name: 'Tout effacer ?' })
    .getByRole('button', { name: 'Tout effacer' })
    .click()
  await expect(list(page).getByRole('listitem')).toHaveCount(0)
  expect(await page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY)).toBeNull()
})

test('recette par scan : produit inconnu -> message, la liste est conservée, recherche possible', async ({
  page,
}) => {
  await noCamera(page)
  await mockOff(page)
  await openScreen(page)
  await typeCode(page, LARDONS)
  await expect(list(page).getByText('Lardons fumés')).toBeVisible()
  await typeCode(page, UNKNOWN)
  await expect(page.getByText(/Produit inconnu/)).toBeVisible()
  await expect(list(page).getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Créer l’aliment' })).toBeVisible()
  await page.getByRole('button', { name: 'Chercher un aliment' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Chercher un aliment' })).toBeVisible()
})

test('recette par scan : caméra refusée -> message, la saisie du code reste possible', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(Object.assign(new Error('refusé'), { name: 'NotAllowedError' })),
      },
    })
  })
  await mockOff(page)
  await openScreen(page)
  await expect(page.getByText('Caméra refusée').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Réessayer la caméra' })).toBeVisible()
  await typeCode(page, EMMENTAL)
  await expect(list(page).getByText('Emmental râpé')).toBeVisible()
})
