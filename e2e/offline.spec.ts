import { expect, test } from '@playwright/test'
import { completeOnboarding } from './helpers.ts'

test("l'app s'ouvre hors ligne (lien profond + rechargement)", async ({ page, context }) => {
  await page.goto('./')
  await completeOnboarding(page)
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)')

  const controlled = async (): Promise<boolean> =>
    page.evaluate<boolean>('navigator.serviceWorker.controller !== null')
  if (!(await controlled())) await page.reload()
  await expect.poll(controlled).toBe(true)

  await context.setOffline(true)

  await page.goto('./nutrition')
  await page.reload()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nutrition')
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()

  // Les sections chargées à la demande sont aussi en cache.
  await page.goto('./reglages')
  await expect(page.getByRole('button', { name: 'Préparer la sauvegarde' })).toBeVisible()
  await page.goto('./progres')
  await expect(page.getByRole('img', { name: /Courbe de poids/ })).toBeVisible()
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
