import { expect, test } from '@playwright/test'
import { collectErrors, completeOnboarding, openSettings } from './helpers.ts'

// SHOTS_DIR : dossier où écrire des captures de la page (usage manuel, ignoré sinon).
const shots = process.env['SHOTS_DIR']

test('page /dev/ui : accessible depuis Réglages, kit affiché, feuille Ajouter, 390 px sans débordement', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)

  await openSettings(page)
  await page.getByRole('link', { name: 'Composants de l’interface (dev)' }).click()
  await expect(page).toHaveURL(/\/dev\/ui$/)
  await expect(page.getByRole('heading', { name: 'Composants', level: 1 })).toBeVisible()
  // Hors de la mise en page v1 : pas de barre d'onglets v1, mais la barre flottante v2.
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Ajouter', exact: true })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // Polices auto-hébergées effectivement chargées.
  await page.evaluate(() => document.fonts.ready)
  const fonts = await page.evaluate(() =>
    ['700 20px "Archivo Variable"', '400 15px "Figtree Variable"'].map((f) => document.fonts.check(f)),
  )
  expect(fonts).toEqual([true, true])

  if (shots) await page.screenshot({ path: `${shots}/dev-ui-top.png` })

  // Cibles tactiles >= 44 px : Segmented, PillTabs, Stepper, TabBar.
  const targets = page.locator(
    '[role="radiogroup"] [role="radio"], [role="tablist"] [role="tab"], [role="group"] button, nav[aria-label="Navigation principale"] a, nav[aria-label="Navigation principale"] button',
  )
  const enabled = await targets.evaluateAll((els) =>
    els
      .filter((e) => !(e as HTMLButtonElement).disabled)
      .map((e) => ({
        name: e.textContent || e.getAttribute('aria-label') || '',
        r: e.getBoundingClientRect(),
      }))
      .filter(({ r }) => r.height < 43.5 || r.width < 43.5)
      .map(({ name, r }) => `${name} ${Math.round(r.width)}x${Math.round(r.height)}`),
  )
  expect(enabled).toEqual([])

  // Visuels : cartes musculaires (15 zones isolées + 7 exercices x 2 fonds), 13 pictogrammes en tuile et en 24 px.
  await page.getByRole('heading', { name: 'Visuels' }).scrollIntoViewIfNeeded()
  await expect(page.locator('path[data-zone]').first()).toBeAttached()
  await expect(
    page.getByRole('img', { name: /Muscles ciblés \(vue de dos\) : Fessiers, Ischio-jambiers/ }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('img', { name: /Muscles ciblés \(vue de face\) : Quadriceps, Fessiers/ }).first(),
  ).toBeVisible()
  await expect(page.getByText('Œuf', { exact: true })).toBeVisible()
  const overflowVisuals = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflowVisuals).toBeLessThanOrEqual(0)
  if (shots) {
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${shots}/dev-ui-visuals.png` })
    await page.getByText('Pompes', { exact: true }).first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${shots}/dev-ui-visuals-exercises.png` })
    await page.getByText('Matière grasse', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${shots}/dev-ui-visuals-food.png` })
  }

  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Ajouter' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Scanner' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Démarrer une séance' })).toBeVisible()
  if (shots) {
    await page.waitForTimeout(400) // fin de l'animation d'ouverture
    await page.screenshot({ path: `${shots}/dev-ui-logsheet.png` })
  }

  // Repas ciblé modifiable.
  await sheet.getByRole('button', { name: /Changer de repas/ }).click()
  await sheet.getByRole('radio', { name: 'dîner' }).click()
  await expect(sheet.getByRole('button', { name: /Repas au dîner/ })).toHaveText('au dîner')

  // Cibles tactiles >= 44 px dans la feuille.
  const small = await sheet
    .getByRole('button')
    .evaluateAll(
      (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length,
    )
  expect(small).toBe(0)

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)

  if (shots) {
    await page.getByRole('heading', { name: 'Couleurs' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${shots}/dev-ui-colors.png` })
    await page.getByRole('heading', { name: 'Boutons' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${shots}/dev-ui-buttons.png` })
    await page.getByRole('heading', { name: 'Chiffres' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${shots}/dev-ui-numbers.png` })
  }
  expect(errors).toEqual([])
})
