import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding, openSettings } from './helpers.ts'

const consumed = (page: Page) => page.getByTestId('kcal-consumed')
/** Texte sans espaces de milliers (Intl insère des espaces insécables). */
const digits = async (page: Page, id: string) =>
  Number(((await page.getByTestId(id).textContent()) ?? '').replace(/\D/g, ''))

/** Évite d'interrompre un chunk lazy en cours de chargement (« Importing a module script failed »). */
const settle = (page: Page) => page.waitForLoadState('networkidle')

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name })

async function openAdd(page: Page, meal: string) {
  await page.getByRole('link', { name: `Ajouter au repas : ${meal}` }).click()
  await expect(page.getByRole('searchbox', { name: 'Rechercher un aliment' })).toBeVisible()
}

async function addFree(page: Page, name: string, kcal: string, protein?: string) {
  await page.getByRole('button', { name: 'Saisie libre' }).click()
  const dialog = page.getByRole('dialog', { name: 'Saisie libre' })
  await dialog.getByLabel('Nom').fill(name)
  await dialog.getByLabel('Calories').fill(kcal)
  if (protein) await dialog.getByLabel('Protéines').fill(protein)
  await dialog.getByRole('button', { name: 'Ajouter' }).click()
  await expect(dialog).toBeHidden()
}

test('journal : recherche, saisie libre, favori, copie d’hier, objectifs', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await settle(page)
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Nutrition' })
    .click()
  await expect(page.getByRole('heading', { name: 'Nutrition' })).toBeVisible()
  await expect(consumed(page)).toHaveText('0')
  const target = await digits(page, 'kcal-left') // objectif - 0
  expect(target).toBeGreaterThan(1500)

  // Poulet cru sans accent ni pluriel exact : 150 g au déjeuner (122 kcal / 100 g -> 183 kcal)
  await openAdd(page, 'Déjeuner')
  await page.getByRole('searchbox', { name: 'Rechercher un aliment' }).fill('poulet cru')
  const chicken = page.getByRole('button', { name: /Poulet blanc, viande et peau crues/ })
  await expect(chicken).toBeVisible({ timeout: 30_000 }) // première préparation de Ciqual
  await chicken.click()
  const sheet = page.getByRole('dialog', { name: /Poulet blanc, viande et peau crues/ })
  await sheet.getByLabel('Quantité').fill('150')
  await expect(sheet.getByTestId('preview')).toContainText('183 kcal')
  await sheet.getByRole('button', { name: 'Ajouter' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Ajouté : Poulet blanc' })).toBeVisible()
  await page.getByRole('button', { name: /^Terminer/ }).click()
  await expect(consumed(page)).toHaveText('183')
  await expect(page.getByRole('button', { name: /^Modifier Poulet blanc.*183 kcal/ })).toBeVisible()

  // Saisie libre au dîner : 500 kcal -> 683
  await openAdd(page, 'Dîner')
  await addFree(page, 'Pizza', '500', '20')
  await page.getByRole('button', { name: /^Terminer/ }).click()
  await expect(consumed(page)).toHaveText('683')
  expect(await digits(page, 'kcal-left')).toBe(target - 683)

  // Favori, puis ajout en un tap (100 g par défaut : +122 kcal -> 805)
  await openAdd(page, 'Déjeuner')
  await page.getByRole('searchbox', { name: 'Rechercher un aliment' }).fill('poulet cru')
  await chicken.click()
  await expect(sheet.getByLabel('Quantité')).toHaveValue('150') // dernière quantité utilisée
  await sheet.getByRole('button', { name: 'Mettre en favori' }).click()
  await expect(sheet.getByRole('button', { name: 'Favori' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await page.getByRole('searchbox', { name: 'Rechercher un aliment' }).fill('')
  await page.getByText('Favoris', { exact: true }).click()
  await page.getByRole('button', { name: /^Ajouter Poulet blanc.*100 g, 122 kcal/ }).click()
  await page.getByRole('button', { name: /^Terminer/ }).click()
  await expect(consumed(page)).toHaveText('805')

  // Copie d'un repas d'hier : on crée l'entrée de la veille via l'UI
  await page.getByRole('button', { name: 'Jour précédent' }).click()
  await expect(page.getByText('Hier')).toBeVisible()
  await expect(consumed(page)).toHaveText('0')
  await openAdd(page, 'Petit-déjeuner')
  await addFree(page, 'Skyr nature', '120', '17')
  await page.getByRole('button', { name: /^Terminer/ }).click()
  await expect(page.getByText('Hier')).toBeVisible()
  await expect(consumed(page)).toHaveText('120')
  await page.getByRole('button', { name: 'Jour suivant' }).click()
  await expect(page.getByText('Aujourd’hui', { exact: true }).first()).toBeVisible()
  await expect(consumed(page)).toHaveText('805')
  await page.getByRole('button', { name: 'Copier d’hier : Petit-déjeuner' }).click()
  await expect(consumed(page)).toHaveText('925')
  await page.getByRole('status').getByRole('button', { name: 'Annuler' }).click()
  await expect(consumed(page)).toHaveText('805')
  await page.getByRole('button', { name: 'Copier d’hier : Petit-déjeuner' }).click()
  await expect(consumed(page)).toHaveText('925')

  // Modifier la quantité d'une entrée : 150 g -> 200 g de poulet (+61 kcal)
  await page.getByRole('button', { name: /^Modifier Poulet blanc.*183 kcal/ }).click()
  const edit = page.getByRole('dialog', { name: /Poulet blanc/ })
  await edit.getByLabel('Quantité').fill('200')
  await edit.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(consumed(page)).toHaveText('986')

  // Supprimer la saisie libre du dîner (confirmation)
  await page.getByRole('button', { name: /^Modifier Pizza/ }).click()
  await page.getByRole('dialog', { name: 'Pizza' }).getByRole('button', { name: 'Supprimer' }).click()
  await page
    .getByRole('dialog', { name: 'Supprimer cette entrée ?' })
    .getByRole('button', { name: 'Supprimer' })
    .click()
  await expect(consumed(page)).toHaveText('486')

  // Objectifs : surplus 20 % -> l'objectif de l'anneau augmente
  await openSettings(page)
  await page.getByLabel('Surplus calorique').fill('20')
  await expect(page.getByTestId('goals-preview')).toBeVisible()
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Objectifs nutritionnels' }) })
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click()
  await expect(page.getByText('Objectifs enregistrés.')).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Nutrition' })
    .click()
  const left = await digits(page, 'kcal-left')
  const newTarget = left + 486
  expect(Math.abs(newTarget - Math.round((target / 1.12) * 1.2))).toBeLessThanOrEqual(2)

  expect(errors).toEqual([])
})

test('journal v2 : navigation de jour, sections en pastilles, cibles ≥ 44 px', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await settle(page)
  await nav(page, 'Nutrition').click()
  await expect(page.getByRole('heading', { name: 'Nutrition', level: 1 })).toBeVisible()

  // Jour suivant possible (préparer demain) ; ?date= conservé ; retour à aujourd'hui.
  await page.getByRole('button', { name: 'Jour suivant' }).click()
  await expect(page.getByText('Demain')).toBeVisible()
  await page.getByRole('button', { name: 'Revenir à aujourd’hui' }).click()
  await page.getByRole('button', { name: 'Jour précédent' }).click()
  await expect(page).toHaveURL(/\/nutrition\?date=\d{4}-\d{2}-\d{2}$/)
  await page.getByRole('button', { name: 'Revenir à aujourd’hui' }).click()
  await expect(page.getByRole('button', { name: 'Revenir à aujourd’hui' })).toHaveCount(0)

  // Sections : liens en pastilles, Journal est la page courante.
  const tabs = page.getByRole('navigation', { name: 'Sections de la nutrition' })
  await expect(tabs.getByRole('link')).toHaveText(['Journal', 'Recettes', 'Frigo', 'Courses'])
  await expect(tabs.getByRole('link', { name: 'Journal' })).toHaveAttribute('aria-current', 'page')

  // Cibles tactiles >= 44 px : onglets, jours, ajout par repas.
  for (const target of [
    ...(await tabs.getByRole('link').all()),
    page.getByRole('button', { name: 'Jour précédent' }),
    page.getByRole('link', { name: 'Ajouter au repas : Déjeuner' }),
  ]) {
    const box = await target.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  // Aucun débordement horizontal à 390 px.
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main')
    return main ? main.scrollWidth - main.clientWidth : 0
  })
  expect(overflow).toBeLessThanOrEqual(0)

  await tabs.getByRole('link', { name: 'Courses' }).click()
  await expect(page).toHaveURL(/\/nutrition\/courses$/)
  expect(errors).toEqual([])
})

test('aliment : création, modification, suppression', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await settle(page)
  await page.goto('./nutrition/aliments/nouveau')
  await page.getByLabel('Nom', { exact: true }).fill('Granola maison')
  await page.getByLabel('Calories').fill('450,5')
  await page.getByLabel('Protéines').fill('10')
  await page.getByLabel('Glucides').fill('60')
  await page.getByLabel('Lipides').fill('15')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('heading', { name: 'Granola maison' })).toBeVisible()
  await expect(page.getByText('451 kcal')).toBeVisible()
  await page.getByRole('link', { name: 'Modifier' }).click()
  await page.getByLabel('Lipides').fill('')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('Lipides').fill('12')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('12 g').first()).toBeVisible()
  await page.getByRole('button', { name: 'Supprimer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByRole('searchbox', { name: 'Rechercher un aliment' })).toBeVisible()
  expect(errors).toEqual([])
})

async function searchChicken(page: Page) {
  await page.getByRole('searchbox', { name: 'Rechercher un aliment' }).fill('poulet cru')
  const row = page.getByRole('button', { name: /Poulet blanc, viande et peau crues/ })
  await expect(row).toBeVisible({ timeout: 30_000 })
  return row
}

test('contexte jour/repas conservé après la fiche d’un aliment', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await settle(page)
  await nav(page, 'Nutrition').click()
  await page.getByRole('button', { name: 'Jour précédent' }).click()
  await openAdd(page, 'Dîner')
  await expect(page.getByRole('heading', { name: /Ajouter au dîner · hier/ })).toBeVisible()
  const row = await searchChicken(page)
  await row.click()
  await page.getByRole('dialog').getByRole('link', { name: 'Voir la fiche' }).click()
  await expect(page.getByRole('heading', { name: /Poulet blanc/ })).toBeVisible()
  await page.getByRole('link', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Ajouter au dîner · hier/ })).toBeVisible()
  await (await searchChicken(page)).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter' }).click()
  await page.getByRole('button', { name: /^Terminer/ }).click()
  await expect(page.getByText('Hier')).toBeVisible()
  await expect(consumed(page)).toHaveText('122')
  await page.getByRole('button', { name: 'Jour suivant' }).click()
  await expect(consumed(page)).toHaveText('0')
  expect(errors).toEqual([])
})

test('aliment Ciqual : modifier puis rétablir l’original (favori conservé)', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await settle(page)
  await page.goto('./nutrition/ajouter?repas=lunch')
  await (await searchChicken(page)).click()
  await page.getByRole('dialog').getByRole('link', { name: 'Voir la fiche' }).click()
  await page.getByRole('button', { name: 'Mettre en favori' }).click()
  await expect(page.getByRole('button', { name: 'Retirer des favoris' })).toBeVisible()
  await page.getByRole('link', { name: 'Modifier' }).click()
  await page.getByLabel('Calories').fill('200')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('200 kcal')).toBeVisible()
  await page.getByRole('button', { name: 'Rétablir l’original' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Rétablir' }).click()
  await expect(page.getByText('122 kcal')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rétablir l’original' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retirer des favoris' })).toBeVisible()
  expect(errors).toEqual([])
})

test('suppression d’un aliment depuis Ajouter : contexte conservé', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await settle(page)
  await nav(page, 'Nutrition').click()
  await page.getByRole('button', { name: 'Jour précédent' }).click()
  await openAdd(page, 'Déjeuner')
  await page.getByRole('link', { name: 'Créer un aliment' }).click()
  await page.getByLabel('Nom', { exact: true }).fill('Barre test')
  await page.getByLabel('Calories').fill('300')
  await page.getByLabel('Protéines').fill('10')
  await page.getByLabel('Glucides').fill('40')
  await page.getByLabel('Lipides').fill('8')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('heading', { name: /Ajouter au déjeuner · hier/ })).toBeVisible()
  await page.getByRole('button', { name: /Barre test/ }).click()
  await page.getByRole('dialog').getByRole('link', { name: 'Voir la fiche' }).click()
  await page.getByRole('button', { name: 'Supprimer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByRole('heading', { name: /Ajouter au déjeuner · hier/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Barre test/ })).toHaveCount(0)
  expect(errors).toEqual([])
})
