import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding } from './helpers.ts'

/** Dépassement horizontal (document ou zone qui défile) à 390 px. */
async function overflowX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const de = document.documentElement
    const main = document.querySelector('main')
    return Math.max(de.scrollWidth - de.clientWidth, main ? main.scrollWidth - main.clientWidth : 0)
  })
}

/** Luminance approximative (0-255) du fond du `<main>`. */
async function mainLightness(page: Page): Promise<number> {
  return page.locator('main').evaluate((el) => {
    const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? []
    const [r = 0, g = 0, b = 0] = m.map(Number)
    return 0.299 * r + 0.587 * g + 0.114 * b
  })
}

test('onboarding : pas de dépassement horizontal', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Commencer' })).toBeVisible()
  expect(await overflowX(page)).toBeLessThanOrEqual(0)
})

test('écrans v2 : pas de dépassement à 390 px, formulaire et import sur fond clair', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  const screens: Array<{ path: string; heading: string | RegExp; light?: boolean }> = [
    { path: 'reglages', heading: 'Réglages' },
    { path: 'nutrition/ajouter', heading: /^Ajouter / },
    { path: 'nutrition/recettes/nouvelle', heading: 'Nouvelle recette', light: true },
    { path: 'reglages/importer', heading: 'Importer', light: true },
    { path: 'claude/reponse', heading: 'Réponse de Claude' },
  ]
  for (const s of screens) {
    await page.goto(s.path)
    await expect(page.getByRole('heading', { level: 1, name: s.heading }).first()).toBeVisible()
    expect(await overflowX(page), `débordement sur ${s.path}`).toBeLessThanOrEqual(0)
    if (s.light) expect(await mainLightness(page), `fond sombre sur ${s.path}`).toBeGreaterThan(200)
    await expect(page.locator('main.ds-page')).toHaveCount(1)
  }
  expect(errors).toEqual([])
})
