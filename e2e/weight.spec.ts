import { expect, test } from '@playwright/test'
import { collectErrors, completeOnboarding, localDate } from './helpers.ts'

test('pesées : ajout, remplacement à la même date, modification, suppression', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page) // pesée 72,5 aujourd'hui
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Progrès' })
    .click()

  const today = localDate(0)
  const yesterday = localDate(-1)
  const rows = page.getByRole('button', { name: /^Modifier la pesée/ })
  await expect(rows).toHaveCount(1)

  // Ajout hier
  await page.getByRole('button', { name: 'Ajouter une pesée' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter une pesée' })
  await dialog.getByLabel('Poids').fill('71,0')
  await dialog.getByLabel('Date').fill(yesterday)
  await dialog.getByLabel('Note (facultatif)').fill('matin')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('72,5')
  await expect(rows.nth(1)).toContainText('71')
  await expect(rows.nth(1)).toContainText('matin')

  // Remplacement à la même date (aujourd'hui) : avertissement, une seule ligne par date
  await page.getByRole('button', { name: 'Ajouter une pesée' }).click()
  await dialog.getByLabel('Poids').fill('73,2')
  await dialog.getByLabel('Date').fill(today)
  await expect(dialog.getByRole('status')).toContainText('sera remplacée')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('73,2')
  await expect(page.getByText('72,5')).toHaveCount(0)

  // Le résumé se met à jour : dernière pesée = 73,2
  const stat = page.getByRole('region', { name: 'Poids', exact: true })
  await expect(stat).toContainText('73,2')

  // Modification de la pesée d'hier
  await rows.nth(1).click()
  const edit = page.getByRole('dialog', { name: 'Modifier la pesée' })
  await edit.getByLabel('Poids').fill('71,8')
  await edit.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(edit).toBeHidden()
  await expect(rows.nth(1)).toContainText('71,8')

  // Suppression avec confirmation : annuler ne supprime rien
  await rows.first().click()
  await edit.getByRole('button', { name: 'Supprimer' }).click()
  const confirm = page.getByRole('dialog', { name: 'Supprimer cette pesée ?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Annuler' }).click()
  await expect(rows).toHaveCount(2)
  await edit.getByRole('button', { name: 'Annuler' }).click()
  await expect(edit).toBeHidden()

  await rows.first().click()
  await edit.getByRole('button', { name: 'Supprimer' }).click()
  await confirm.getByRole('button', { name: 'Supprimer' }).click()
  await expect(confirm).toBeHidden()
  await expect(rows).toHaveCount(1)
  await expect(stat).toContainText('71,8')

  // Supprimer la dernière : état vide
  await rows.first().click()
  await edit.getByRole('button', { name: 'Supprimer' }).click()
  await confirm.getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByText('Aucune pesée pour l’instant')).toBeVisible()

  expect(errors).toEqual([])
})

test('courbe de poids : un appui donne la valeur lisible (tactile, sans survol)', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Progrès' })
    .click()
  for (const [offset, kg] of [
    [-6, '71,0'],
    [-3, '71,6'],
  ] as const) {
    await page.getByRole('button', { name: 'Ajouter une pesée' }).click()
    const dialog = page.getByRole('dialog', { name: 'Ajouter une pesée' })
    await dialog.getByLabel('Poids').fill(kg)
    await dialog.getByLabel('Date').fill(localDate(offset))
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(dialog).toBeHidden()
  }
  const chart = page.getByRole('img', { name: /Courbe de la moyenne/ })
  await chart.scrollIntoViewIfNeeded()
  const box = await chart.boundingBox()
  if (!box) throw new Error('courbe introuvable')
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await expect(chart.locator('.recharts-tooltip-wrapper')).toContainText(/\d+,\d kg/)
  expect(errors).toEqual([])
})
