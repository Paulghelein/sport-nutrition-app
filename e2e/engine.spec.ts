import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding, openSettings, openTraining } from './helpers.ts'

/** Heure figée : la graine de la génération (la date) rend les séances identiques d'un lancement à l'autre. */
async function start(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-15T09:00:00'))
  await page.goto('./')
  await completeOnboarding(page)
  await openTraining(page)
}

/** Les radios sont masqués visuellement (sr-only) : on clique leur étiquette, puis on vérifie l'état du radio. */
async function pick(page: Page, name: string) {
  const radio = page.getByRole('radio', { name })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
}

test('aperçu de séance : 30 puis 60 min, finisher à 60, durée retenue au retour', async ({ page }) => {
  const errors = collectErrors(page)
  await start(page)

  await pick(page, '30 min')
  await page.getByRole('link', { name: 'Voir la séance' }).click()
  await expect(page).toHaveURL(/\/entrainement\/apercu\?duree=30$/)
  await expect(page.getByRole('heading', { name: 'Aperçu', level: 1 })).toBeVisible()
  await expect(page.getByText(/^≈ \d+ min$/)).toBeVisible()
  await expect(page.locator('a[href*="/entrainement/exercices/"]').nth(2)).toBeVisible()
  await expect(page.getByText('Finisher', { exact: true })).toHaveCount(0)

  await pick(page, '60 min')
  await expect(page).toHaveURL(/duree=60$/)
  await expect(page.getByText('Finisher', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Entraînement', exact: true }).first().click()
  await expect(page.getByRole('radio', { name: '60 min' })).toBeChecked()

  expect(errors).toEqual([])
})

test('volume de la semaine visible sur l’écran Séance', async ({ page }) => {
  const errors = collectErrors(page)
  await start(page)
  await expect(page.getByRole('heading', { name: 'Volume des 7 derniers jours' })).toBeVisible()
  await expect(page.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '0')
  expect(errors).toEqual([])
})

test('réglages du moteur : cible conservée, validation, rétablissement, fréquence', async ({ page }) => {
  const errors = collectErrors(page)
  await start(page)
  await openSettings(page)

  const section = page.locator('section', {
    has: page.getByRole('heading', { name: 'Moteur d’entraînement' }),
  })
  const biceps = section.getByRole('group', { name: 'Biceps' })
  const max = biceps.getByLabel('Maximum')
  const min = biceps.getByLabel('Minimum')

  await expect(max).toHaveValue('8')
  await max.fill('10')
  await section.getByRole('button', { name: 'Enregistrer les cibles' }).click()
  await expect(section.getByText('Cibles enregistrées.')).toBeVisible()

  await page.reload()
  await expect(max).toHaveValue('10')

  // Validation : min > max
  await min.fill('12')
  await section.getByRole('button', { name: 'Enregistrer les cibles' }).click()
  await expect(section.getByRole('alert')).toContainText('minimum ne peut pas dépasser')

  // Rétablir un groupe, avec confirmation
  await section.getByRole('button', { name: /^Rétablir \(4–8\), Biceps/ }).click()
  await page.getByRole('button', { name: 'Rétablir', exact: true }).click()
  await expect(section.getByText('Cible « Biceps » : valeur d’origine rétablie.')).toBeVisible()
  await expect(max).toHaveValue('8')
  await expect(min).toHaveValue('4')

  // Fréquence de la semaine allégée
  await section.getByRole('button', { name: /Augmenter : semaines/ }).click()
  await expect(section.getByText('Fréquence enregistrée.')).toBeVisible()
  await page.reload()
  await expect(
    section.getByRole('group', { name: /Semaine allégée toutes les/ }).getByRole('status'),
  ).toHaveText('7')

  expect(errors).toEqual([])
})
