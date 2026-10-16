import { expect, test } from '@playwright/test'
import { completeOnboarding, localDate } from './helpers.ts'

test("l'app s'ouvre hors ligne (lien profond + rechargement)", async ({ page, context }) => {
  await page.goto('./')
  await completeOnboarding(page)
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)')

  const controlled = async (): Promise<boolean> =>
    page.evaluate<boolean>('navigator.serviceWorker.controller !== null')
  if (!(await controlled())) await page.reload()
  await expect.poll(controlled).toBe(true)

  // Deux pesées dans les 8 dernières semaines : la courbe (Recharts, chunk à la demande) s'affiche.
  const earlier = localDate(-10)
  await page.evaluate(
    (date) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('forge')
        open.onerror = () => reject(new Error('open'))
        open.onsuccess = () => {
          const tx = open.result.transaction('weighIns', 'readwrite')
          tx.objectStore('weighIns').put({
            id: 'offline-w',
            date,
            weightKg: 71.5,
            createdAt: new Date().toISOString(),
          })
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
          tx.onerror = () => reject(new Error('write'))
        }
      }),
    earlier,
  )

  await context.setOffline(true)

  await page.goto('./nutrition')
  await page.reload()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nutrition')
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()

  // Les sections chargées à la demande sont aussi en cache.
  await page.goto('./reglages')
  await expect(page.getByRole('button', { name: 'Préparer la sauvegarde' })).toBeVisible()
  await page.goto('./progres')
  await expect(page.getByRole('img', { name: /Courbe de la moyenne 7 jours/ })).toBeVisible()
})

test('le journal fonctionne en mode avion (recherche Ciqual + ajout)', async ({ page, context }) => {
  await page.goto('./')
  await completeOnboarding(page)
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)')
  const controlled = async (): Promise<boolean> =>
    page.evaluate<boolean>('navigator.serviceWorker.controller !== null')
  if (!(await controlled())) await page.reload()
  await expect.poll(controlled).toBe(true)

  // Hors ligne avant tout chargement de Ciqual : le chunk de données doit venir du précache.
  await context.setOffline(true)
  await page.goto('./nutrition')
  await page.getByRole('link', { name: 'Ajouter au repas : Déjeuner' }).click()
  const search = page.getByRole('searchbox', { name: 'Rechercher un aliment' })
  await search.fill('poulet cru')
  const chicken = page.getByRole('button', { name: /Poulet blanc, viande et peau crues/ })
  await expect(chicken).toBeVisible({ timeout: 30_000 })
  await chicken.click()
  const sheet = page.getByRole('dialog', { name: /Poulet blanc, viande et peau crues/ })
  await sheet.getByLabel('Quantité').fill('150')
  await expect(sheet.getByTestId('preview')).toContainText('183 kcal')
  await sheet.getByRole('button', { name: 'Ajouter' }).click()
  await page.getByRole('button', { name: /^Terminer/ }).click()
  await expect(page.getByTestId('kcal-consumed')).toHaveText('183')
})

test('les polices Archivo et Figtree se chargent hors ligne (précache)', async ({ page, context }) => {
  await page.goto('./')
  await completeOnboarding(page)
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)')
  const controlled = async (): Promise<boolean> =>
    page.evaluate<boolean>('navigator.serviceWorker.controller !== null')
  if (!(await controlled())) await page.reload()
  await expect.poll(controlled).toBe(true)

  await context.setOffline(true)
  await page.goto('./dev/ui')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Composants', level: 1 })).toBeVisible()

  await page.evaluate('document.fonts.ready.then(() => true)')
  const loaded = await page.evaluate(() => ({
    archivo: document.fonts.check('800 20px "Archivo Variable"'),
    figtree: document.fonts.check('400 15px "Figtree Variable"'),
    faces: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
  }))
  expect(loaded.archivo).toBe(true)
  expect(loaded.figtree).toBe(true)
  // check() est vrai aussi quand rien n'est à charger : on exige que les deux fichiers soient réellement chargés.
  expect(loaded.faces.join(' ')).toMatch(/Archivo Variable/)
  expect(loaded.faces.join(' ')).toMatch(/Figtree Variable/)
})

// PNG 1×1 valide : la photo doit se décoder (une image illisible déclenche le repli sur le pictogramme).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('la photo d’un produit scanné s’affiche dans le journal hors ligne (blob + badge code-barres)', async ({
  page,
  context,
}) => {
  const EAN = '3017620422003'
  const CORS = { 'access-control-allow-origin': '*' }
  // Pas de caméra : on saisit le code à la main.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
  })
  // `context.route` : couvre aussi les requêtes émises avec le service worker actif.
  await context.route(/images\.openfoodfacts\.org/, (route) =>
    route.fulfill({ headers: { ...CORS, 'content-type': 'image/png' }, body: PNG_1X1 }),
  )
  await context.route(/world\.openfoodfacts\.org/, (route) =>
    route.fulfill({
      headers: CORS,
      json: {
        status: 1,
        product: {
          product_name: 'Skyr photo test',
          brands: 'Marque Test',
          serving_quantity: 150,
          nutriments: { 'energy-kcal_100g': 60, proteins_100g: 10, carbohydrates_100g: 4, fat_100g: 0.2 },
          image_front_small_url:
            'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.3.200.jpg',
        },
      },
    }),
  )

  await page.goto('./')
  await completeOnboarding(page)
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)')
  const controlled = async (): Promise<boolean> =>
    page.evaluate<boolean>('navigator.serviceWorker.controller !== null')
  if (!(await controlled())) await page.reload()
  await expect.poll(controlled).toBe(true)

  // Scan (en ligne) : fiche + photo récupérées, produit ajouté au petit-déjeuner.
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Nutrition' })
    .click()
  await page.getByRole('link', { name: 'Ajouter au repas : Petit-déjeuner' }).click()
  await page.getByRole('link', { name: 'Scanner un code-barres' }).click()
  await page.getByLabel('Saisir le code à la main').fill(EAN)
  await page.getByRole('button', { name: 'Chercher ce code' }).click()
  const sheet = page.getByRole('dialog', { name: 'Skyr photo test' })
  await sheet.getByRole('button', { name: 'Ajouter' }).click()
  await page.getByRole('button', { name: /^Terminer/ }).click()

  const row = page.getByRole('button', { name: /^Modifier Skyr photo test/ })
  await expect(row).toBeVisible()
  await expect(row.locator('img')).toHaveAttribute('src', /^blob:/)
  await expect(row.locator('.lucide-scan-barcode')).toHaveCount(1)

  // Hors ligne + rechargement : la photo vient de Dexie (blob recréé), pas du réseau.
  await context.setOffline(true)
  await page.reload()
  const offlineRow = page.getByRole('button', { name: /^Modifier Skyr photo test/ })
  await expect(offlineRow).toBeVisible()
  const img = offlineRow.locator('img')
  await expect(img).toHaveAttribute('src', /^blob:/)
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
    .toBe(true)
  await expect(offlineRow.locator('.lucide-scan-barcode')).toHaveCount(1)
  await expect(offlineRow).toContainText('scanné')
})
