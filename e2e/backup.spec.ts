import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding, localDate, openSettings } from './helpers.ts'

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' })

/**
 * Dans Playwright WebKit, navigator.canShare({files}) renvoie true mais share() ne se résout jamais :
 * on le retire pour forcer le chemin « téléchargement » (le chemin Web Share reste à tester sur iPhone).
 */
async function forceDownloadPath(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
  })
}

async function exportFile(page: Page): Promise<{ name: string; content: string }> {
  await page.getByRole('button', { name: 'Préparer la sauvegarde' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Télécharger le fichier' }).click()
  const download = await downloadPromise
  await expect(page.getByText(/Fichier proposé au téléchargement/)).toBeVisible()
  await page.getByRole('button', { name: 'C’est enregistré' }).click()
  const path = await download.path()
  const { readFile } = await import('node:fs/promises')
  return { name: download.suggestedFilename(), content: await readFile(path, 'utf8') }
}

async function addWeighIn(page: Page, kg: string, date: string) {
  await nav(page).getByRole('link', { name: 'Progrès' }).click()
  await page.getByRole('button', { name: 'Ajouter une pesée' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter une pesée' })
  await dialog.getByLabel('Poids').fill(kg)
  await dialog.getByLabel('Date').fill(date)
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()
}

async function setHeight(page: Page, cm: string) {
  await openSettings(page)
  await page.getByLabel('Taille').fill(cm)
  await page.getByRole('button', { name: 'Enregistrer le profil' }).click()
  await expect(page.getByText('Profil enregistré.')).toBeVisible()
}

async function chooseFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByLabel('Choisir un fichier').setInputFiles(file)
}

test('export puis import Remplacer : retour exact à l’état exporté', async ({ page }) => {
  const errors = collectErrors(page)
  await forceDownloadPath(page)
  await page.goto('./')
  await completeOnboarding(page)
  await addWeighIn(page, '71,4', localDate(-2))

  await openSettings(page)
  await expect(page.getByText('Aucun export pour l’instant.')).toBeVisible()
  const exported = await exportFile(page)
  expect(exported.name).toMatch(/^forge-sauvegarde-.*\.json$/)
  await expect(page.getByText('Sauvegarde exportée.')).toBeVisible()
  await expect(page.getByText(/Dernier export :/)).toBeVisible()
  const parsed = JSON.parse(exported.content) as { tables?: Record<string, unknown[]> }
  expect(JSON.stringify(parsed)).toContain('71.4')

  // Modifications après l'export
  await addWeighIn(page, '80', localDate(0))
  await setHeight(page, '190')

  // Import en mode Remplacer
  await chooseFile(page, {
    name: exported.name,
    mimeType: 'application/json',
    buffer: Buffer.from(exported.content),
  })
  await expect(page.getByText(exported.name)).toBeVisible()
  await page.getByRole('button', { name: 'Remplacer toutes mes données' }).click()
  const confirm = page.getByRole('dialog', { name: 'Tout remplacer ?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Oui, tout remplacer' }).click()
  await expect(page.getByText(/Sauvegarde importée \(données remplacées\)/)).toBeVisible()

  // Le formulaire profil revient à la taille exportée
  await expect(page.getByLabel('Taille')).toHaveValue('178')

  // Pesées : exactement celles de l'export (72,5 et 71,4), pas 80
  await nav(page).getByRole('link', { name: 'Progrès' }).click()
  const rows = page.getByRole('button', { name: /^Modifier la pesée/ })
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('72,5')
  await expect(rows.nth(1)).toContainText('71,4')

  // Un nouvel export est identique sur les données (hors date d'export / réglages)
  await openSettings(page)
  const again = await exportFile(page)
  const strip = (s: string) => {
    const o = JSON.parse(s) as Record<string, unknown>
    delete o['exportedAt']
    const t = o['tables'] as Record<string, unknown> | undefined
    if (t) delete t['settings']
    return o
  }
  expect(strip(again.content)).toEqual(strip(exported.content))

  expect(errors).toEqual([])
})

test('import Fusionner : garde les données actuelles et ajoute celles du fichier', async ({ page }) => {
  const errors = collectErrors(page)
  await forceDownloadPath(page)
  await page.goto('./')
  await completeOnboarding(page)
  await addWeighIn(page, '71,4', localDate(-2))
  await openSettings(page)
  const exported = await exportFile(page)

  // Après l'export : une pesée supplémentaire, et la pesée du jour supprimée côté app
  await addWeighIn(page, '80', localDate(-5))
  await nav(page).getByRole('link', { name: 'Progrès' }).click()
  const rows = page.getByRole('button', { name: /^Modifier la pesée/ })
  await expect(rows).toHaveCount(3)
  await rows.first().click()
  await page
    .getByRole('dialog', { name: 'Modifier la pesée' })
    .getByRole('button', { name: 'Supprimer' })
    .click()
  await page
    .getByRole('dialog', { name: 'Supprimer cette pesée ?' })
    .getByRole('button', { name: 'Supprimer' })
    .click()
  await expect(rows).toHaveCount(2)

  await openSettings(page)
  await chooseFile(page, {
    name: exported.name,
    mimeType: 'application/json',
    buffer: Buffer.from(exported.content),
  })
  await page.getByRole('button', { name: 'Fusionner avec mes données' }).click()
  await expect(page.getByText(/Sauvegarde importée \(données fusionnées\)/)).toBeVisible()

  await nav(page).getByRole('link', { name: 'Progrès' }).click()
  await expect(rows).toHaveCount(3) // 72,5 restaurée + 71,4 + 80 conservée
  await expect(page.getByRole('button', { name: /^Modifier la pesée .* : 80,0 kg$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Modifier la pesée .* : 72,5 kg$/ })).toBeVisible()

  expect(errors).toEqual([])
})

test('import d’un fichier invalide : message d’erreur, rien de modifié', async ({ page }) => {
  const errors = collectErrors(page)
  await forceDownloadPath(page)
  await page.goto('./')
  await completeOnboarding(page)
  await openSettings(page)

  for (const [name, content] of [
    ['casse.json', '{ pas du json'],
    ['vide.json', '{"foo":1}'],
  ] as const) {
    await chooseFile(page, { name, mimeType: 'application/json', buffer: Buffer.from(content) })
    await expect(page.getByText('Ce fichier ne peut pas être importé')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remplacer toutes mes données' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Fusionner avec mes données' })).toHaveCount(0)
  }

  // Données inchangées
  await expect(page.getByLabel('Taille')).toHaveValue('178')
  await nav(page).getByRole('link', { name: 'Progrès' }).click()
  await expect(page.getByRole('button', { name: /^Modifier la pesée/ })).toHaveCount(1)

  expect(errors).toEqual([])
})

test('export : un téléchargement ne note pas l’export tant que l’utilisateur ne confirme pas', async ({
  page,
}) => {
  await forceDownloadPath(page)
  await page.goto('./')
  await completeOnboarding(page)
  await openSettings(page)
  await page.getByRole('button', { name: 'Préparer la sauvegarde' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Télécharger le fichier' }).click()
  await downloadPromise
  await expect(page.getByText('Aucun export pour l’instant.')).toBeVisible()
  await page.getByRole('button', { name: 'C’est enregistré' }).click()
  await expect(page.getByText(/Dernier export :/)).toBeVisible()
})

test('export : share() qui ne se résout jamais ne bloque pas l’interface', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: () => new Promise(() => undefined),
      configurable: true,
    })
  })
  await page.goto('./')
  await completeOnboarding(page)
  await openSettings(page)
  await page.getByRole('button', { name: 'Préparer la sauvegarde' }).click()
  const share = page.getByRole('button', { name: 'Enregistrer ou partager' })
  await share.click()
  await expect(share).toBeEnabled()
  await expect(page.getByText('Aucun export pour l’instant.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Télécharger le fichier' })).toBeEnabled()
})

test('export : share() résolu note l’export, annulé (AbortError) reste silencieux', async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: () => {
        calls += 1
        return calls === 1 ? Promise.reject(new DOMException('annulé', 'AbortError')) : Promise.resolve()
      },
      configurable: true,
    })
  })
  await page.goto('./')
  await completeOnboarding(page)
  await openSettings(page)
  await page.getByRole('button', { name: 'Préparer la sauvegarde' }).click()
  await page.getByRole('button', { name: 'Enregistrer ou partager' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('Aucun export pour l’instant.')).toBeVisible()
  await page.getByRole('button', { name: 'Enregistrer ou partager' }).click()
  await expect(page.getByText('Sauvegarde exportée.')).toBeVisible()
  await expect(page.getByText(/Dernier export :/)).toBeVisible()
})
