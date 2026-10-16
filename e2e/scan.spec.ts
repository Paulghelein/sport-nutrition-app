import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding } from './helpers.ts'

const FOUND = '3017620422003'
const UNKNOWN = '5449000000996'

// Le service worker masquerait les requêtes à `page.route` : on le bloque pour simuler Open Food Facts.
test.use({ serviceWorkers: 'block' })

async function openScanner(page: Page) {
  await page.goto('./')
  await completeOnboarding(page)
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Nutrition' })
    .click()
  await page.getByRole('link', { name: 'Ajouter au repas : Petit-déjeuner' }).click()
  const scan = page.getByRole('link', { name: 'Scanner un code-barres' })
  const box = await scan.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  await scan.click()
  await expect(page.getByRole('heading', { name: 'Scanner un produit' })).toBeVisible()
}

async function typeCode(page: Page, code: string) {
  await page.getByLabel('Saisir le code à la main').fill(code)
  await page.getByRole('button', { name: 'Chercher ce code' }).click()
}

test('scan : produit trouvé, cache sans réseau, produit inconnu, hors ligne', async ({ page }) => {
  const errors = collectErrors(page)
  let calls = 0
  let mode: 'ok' | 'offline' = 'ok'
  await page.route(/openfoodfacts\.org/, async (route) => {
    calls++
    if (mode === 'offline') return route.abort('internetdisconnected')
    if (route.request().url().includes(FOUND)) {
      return route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        json: {
          status: 1,
          product: {
            product_name: 'Pâte à tartiner test',
            brands: 'Marque Test',
            serving_quantity: 15,
            nutriments: {
              'energy-kcal_100g': 539,
              proteins_100g: 6.3,
              carbohydrates_100g: 57.5,
              fat_100g: 30.9,
            },
          },
        },
      })
    }
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { status: 0 } })
  })

  await openScanner(page)

  // Trouvé : portion proposée 15 g -> 81 kcal.
  await typeCode(page, FOUND)
  const sheet = page.getByRole('dialog', { name: 'Pâte à tartiner test' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByLabel('Quantité')).toHaveValue('15')
  await expect(sheet.getByTestId('preview')).toContainText('81 kcal')
  await sheet.getByRole('button', { name: 'Ajouter' }).click()
  await expect(page.getByText('Ajouté : Pâte à tartiner test')).toBeVisible()
  expect(calls).toBe(1)

  // Même code : cache, aucun appel réseau.
  await page.getByRole('button', { name: 'Scanner un autre produit' }).click()
  await typeCode(page, FOUND)
  await expect(page.getByRole('dialog', { name: 'Pâte à tartiner test' })).toBeVisible()
  await page.getByRole('dialog').getByLabel('Quantité').fill('30')
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter' }).click()
  await expect(page.getByRole('button', { name: /^Terminer \(2 ajoutés/ })).toBeVisible()
  expect(calls).toBe(1)

  // Hors ligne.
  mode = 'offline'
  await page.getByRole('button', { name: 'Scanner un autre produit' }).click()
  await typeCode(page, UNKNOWN)
  await expect(page.getByText(/Pas de connexion/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Réessayer', exact: true })).toBeVisible()

  // Réessayer : introuvable -> formulaire pré-rempli avec l'EAN.
  mode = 'ok'
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Créer un aliment' })).toBeVisible()
  await expect(page.getByLabel('Code-barres (facultatif)')).toHaveValue(UNKNOWN)
  await page.getByLabel('Nom', { exact: true }).fill('Soda maison')
  await page.getByLabel('Calories').fill('42')
  await page.getByLabel('Protéines').fill('0')
  await page.getByLabel('Glucides').fill('10,6')
  await page.getByLabel('Lipides').fill('0')
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  const created = page.getByRole('dialog', { name: 'Soda maison' })
  await expect(created).toBeVisible()
  await created.getByLabel('Quantité').fill('330')
  await created.getByRole('button', { name: 'Ajouter' }).click()
  await expect(page.getByText('Ajouté : Soda maison')).toBeVisible()

  // Second scan du même EAN : aliment perso en cache, pas de réseau.
  const before = calls
  await page.getByRole('button', { name: 'Scanner un autre produit' }).click()
  await typeCode(page, UNKNOWN)
  await expect(page.getByRole('dialog', { name: 'Soda maison' })).toBeVisible()
  expect(calls).toBe(before)

  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter' }).click()
  await page.getByRole('button', { name: /^Terminer \(4 ajoutés/ }).click()
  await expect(page.getByRole('button', { name: /^Modifier Soda maison/ }).first()).toBeVisible()

  expect(errors.filter((e) => !e.includes('Failed to load resource'))).toEqual([])
})

test('scan : code invalide refusé', async ({ page }) => {
  let calls = 0
  await page.route(/openfoodfacts\.org/, (route) => {
    calls++
    return route.fulfill({ headers: CORS, json: FULL })
  })
  await openScanner(page)
  await typeCode(page, '1234567890123')
  await expect(page.getByText(/Code invalide/)).toBeVisible()
  expect(calls).toBe(0)
})

const CORS = { 'access-control-allow-origin': '*' }
const FULL = {
  status: 1,
  product: {
    product_name: 'Barre test',
    brands: 'Marque Barre, Autre',
    serving_quantity: 40,
    nutriments: { 'energy-kcal_100g': 400, proteins_100g: 10, carbohydrates_100g: 50, fat_100g: 17 },
  },
}

test('scan : produit incomplet -> formulaire pré-rempli (nom, marque, EAN)', async ({ page }) => {
  const errors = collectErrors(page)
  await page.route(/openfoodfacts\.org/, (route) =>
    route.fulfill({
      headers: CORS,
      json: { status: 1, product: { product_name: 'Yaourt incomplet', brands: 'Laiterie Test, Bis' } },
    }),
  )
  await openScanner(page)
  await typeCode(page, FOUND)
  await expect(page.getByRole('heading', { name: 'Créer un aliment' })).toBeVisible()
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue('Yaourt incomplet')
  await expect(page.getByLabel('Marque')).toHaveValue('Laiterie Test')
  await expect(page.getByLabel('Code-barres (facultatif)')).toHaveValue(FOUND)
  await expect(page.getByText(/sans toutes les valeurs/)).toBeVisible()
  expect(errors.filter((e) => !e.includes('Failed to load resource'))).toEqual([])
})

test('scan : UPC-A 12 chiffres = même cache que l’EAN-13 préfixé de 0, fiche OFF avec ODbL', async ({
  page,
}) => {
  const errors = collectErrors(page)
  const upc = '036000291452'
  const urls: string[] = []
  // Sans caméra : un goto pendant une demande getUserMedia en attente bloque WebKit headless.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
  })
  await page.route(/openfoodfacts\.org/, (route) => {
    urls.push(route.request().url())
    return route.fulfill({ headers: CORS, json: FULL })
  })
  await openScanner(page)
  await typeCode(page, upc)
  const sheet = page.getByRole('dialog', { name: 'Barre test' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Ajouter' }).click()
  expect(urls).toHaveLength(1)
  expect(urls[0]).toContain(`/product/0${upc}.json`)

  await page.getByRole('button', { name: 'Scanner un autre produit' }).click()
  await typeCode(page, `0${upc}`)
  await expect(page.getByRole('dialog', { name: 'Barre test' })).toBeVisible()
  expect(urls).toHaveLength(1)

  // Fiche de l'aliment OFF : marque, EAN, mention ODbL.
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter' }).click()
  await page.getByRole('link', { name: 'Ajouter', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Rechercher un aliment' }).fill('Barre test')
  await page
    .getByRole('button', { name: /Barre test/ })
    .first()
    .click()
  await page.getByRole('dialog').getByRole('link', { name: 'Voir la fiche' }).click()
  await expect(page.getByRole('heading', { name: 'Barre test' })).toBeVisible()
  await expect(page.getByText(/Marque Barre · Open Food Facts/)).toBeVisible()
  await expect(page.getByText(`Code-barres : 0${upc}`)).toBeVisible()
  await expect(page.getByText(/ODbL/)).toBeVisible()
  expect(errors.filter((e) => !e.includes('Failed to load resource'))).toEqual([])
})

test('scan : annuler une recherche en cours, puis quitter l’écran pendant une recherche', async ({
  page,
}) => {
  const errors = collectErrors(page)
  let release: () => void = () => undefined
  const gate = new Promise<void>((r) => (release = r))
  await page.route(/openfoodfacts\.org/, async (route) => {
    await gate
    await route.fulfill({ headers: CORS, json: FULL }).catch(() => undefined)
  })
  await openScanner(page)

  // Annulation : la réponse tardive ne rouvre rien.
  await typeCode(page, FOUND)
  await expect(page.getByText(`Recherche du produit ${FOUND}`)).toBeVisible()
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(page.getByText(/Recherche du produit/)).toHaveCount(0)

  // Quitter pendant une nouvelle recherche.
  await typeCode(page, '5449000000996')
  await expect(page.getByText(/Recherche du produit/)).toBeVisible()
  await page.getByRole('link', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Rechercher un aliment' })).toBeVisible()
  release()
  await page.waitForTimeout(800)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('searchbox', { name: 'Rechercher un aliment' })).toBeVisible()

  // Aucun ajout fantôme dans le journal (navigation interne : un goto pendant une demande de caméra bloque WebKit headless).
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Nutrition' })
    .click()
  await expect(page.getByTestId('kcal-consumed')).toHaveText('0')
  expect(errors.filter((e) => !e.includes('Failed to load resource'))).toEqual([])
})

test('aliment perso : modifier l’EAN (invalide refusé, valide enregistré, vide efface)', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await page.waitForLoadState('networkidle')
  await page.goto('./nutrition/aliments/nouveau')
  await page.getByLabel('Nom', { exact: true }).fill('Barre perso')
  await page.getByLabel('Calories').fill('400')
  await page.getByLabel('Protéines').fill('10')
  await page.getByLabel('Glucides').fill('50')
  await page.getByLabel('Lipides').fill('17')
  await page.getByLabel('Code-barres (facultatif)').fill('1234567890123')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('alert')).toContainText(/Code-barres invalide/)
  await page.getByLabel('Code-barres (facultatif)').fill('3017620422003')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('heading', { name: 'Barre perso' })).toBeVisible()
  await expect(page.getByText('Code-barres : 3017620422003')).toBeVisible()
  await expect(page.getByText(/ODbL/)).toHaveCount(0)

  await page.getByRole('link', { name: 'Modifier' }).click()
  await page.getByLabel('Code-barres (facultatif)').fill('12345')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('alert')).toContainText(/Code-barres invalide/)
  await page.getByLabel('Code-barres (facultatif)').fill('')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('heading', { name: 'Barre perso' })).toBeVisible()
  await expect(page.getByText(/Code-barres :/)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('scan : caméra absente ou refusée, repli manuel, aucune erreur console', async ({ page }) => {
  const errors = collectErrors(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
  })
  await page.route(/openfoodfacts\.org/, (route) => route.fulfill({ headers: CORS, json: FULL }))
  await openScanner(page)
  await expect(page.getByText('Navigateur non compatible')).toBeVisible()
  await typeCode(page, FOUND)
  await expect(page.getByRole('dialog', { name: 'Barre test' })).toBeVisible()
  expect(errors.filter((e) => !e.includes('Failed to load resource'))).toEqual([])
})

test('scan : getUserMedia refusé -> message + réessayer, repli manuel', async ({ page }) => {
  const errors = collectErrors(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: () => Promise.reject(new DOMException('no', 'NotFoundError')),
      },
      configurable: true,
    })
  })
  await openScanner(page)
  await expect(page.getByText('Aucune caméra trouvée')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Réessayer la caméra' })).toBeVisible()
  await expect(page.getByLabel('Saisir le code à la main')).toBeVisible()
  expect(errors).toEqual([])
})

test('scan : 390×844, pas de débordement, cibles tactiles ≥ 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
  })
  await openScanner(page)
  await page.getByLabel('Saisir le code à la main').fill('1234567890123')
  await page.getByRole('button', { name: 'Chercher ce code' }).click()
  await expect(page.getByText(/Code invalide/)).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main a, main button, main input, main select')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 44)
      .map(({ el, r }) => `${el.tagName} ${el.textContent?.trim().slice(0, 30)} ${Math.round(r.height)}px`),
  )
  expect(small).toEqual([])
})
