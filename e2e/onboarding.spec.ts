import { expect, test } from '@playwright/test'
import { collectErrors } from './helpers.ts'

test('onboarding complet avec virgule décimale, puis profil visible dans Réglages', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')

  await expect(page.getByRole('heading', { level: 1, name: 'Bienvenue.' })).toBeVisible()
  await page.getByRole('button', { name: 'Commencer' }).click()

  // Le bouton reste désactivé tant que l'identité n'est pas remplie.
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeDisabled()
  await page.getByLabel('Prénom (facultatif)').fill('Paul')
  await page.getByLabel('Date de naissance').fill('1998-05-12')
  await page.getByLabel('Taille').fill('181')
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Continuer' }).click()

  await expect(page.getByRole('button', { name: 'Continuer' })).toBeDisabled()
  await page.getByLabel('Poids actuel').fill('72,5')
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Continuer' }).click()

  // Récapitulatif
  await expect(page.getByRole('heading', { level: 1, name: 'Récapitulatif' })).toBeVisible()
  await expect(page.getByText('181 cm')).toBeVisible()
  await expect(page.getByText('72,5 kg')).toBeVisible()
  await page.getByRole('button', { name: 'C’est parti' }).click()

  await expect(page).toHaveURL(/\/seance$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Séance' })).toBeVisible()

  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  await nav.getByRole('link', { name: 'Réglages' }).click()
  await expect(page.getByLabel('Prénom (facultatif)')).toHaveValue('Paul')
  await expect(page.getByLabel('Date de naissance')).toHaveValue('1998-05-12')
  await expect(page.getByLabel('Taille')).toHaveValue('181')

  // La pesée d'onboarding apparaît dans Progrès.
  await nav.getByRole('link', { name: 'Progrès' }).click()
  await expect(page.getByText('Dernière pesée').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Modifier la pesée .*72,5 kg$/ })).toBeVisible()

  // Persistance après rechargement : plus d'onboarding. On attend la fin du chargement des modules à la demande
  // (graphique) : un rechargement en plein `import()` est signalé comme erreur par WebKit.
  await page.waitForLoadState('networkidle')
  await page.reload()
  await expect(page).toHaveURL(/\/progres$/)

  expect(errors).toEqual([])
})

test('séances par semaine : boutons − / + d’au moins 44 px (onboarding et Réglages)', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Commencer' }).click()
  await page.getByLabel('Date de naissance').fill('1998-05-12')
  await page.getByLabel('Taille').fill('178')
  await page.getByRole('button', { name: 'Continuer' }).click()

  const check = async () => {
    for (const name of [/Diminuer : séances par semaine, cible/, /Augmenter : séances par semaine, cible/, /Diminuer : séances minimum/, /Augmenter : séances minimum/]) {
      const box = await page.getByRole('button', { name }).boundingBox()
      if (!box) throw new Error(`bouton introuvable : ${String(name)}`)
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  }
  await check()
  await page.getByRole('button', { name: /Augmenter : séances par semaine, cible/ }).click()
  await expect(page.getByRole('group', { name: 'Séances par semaine (cible)' }).getByRole('status')).toHaveText('6')

  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByLabel('Poids actuel').fill('72,5')
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Réglages' }).click()
  await check()
})
