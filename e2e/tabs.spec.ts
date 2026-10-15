import { expect, test } from '@playwright/test'
import { completeOnboarding } from './helpers.ts'

const tabs = [
  { name: 'Séance', path: /\/seance$/, h1: 'Séance' },
  { name: 'Nutrition', path: /\/nutrition$/, h1: 'Nutrition' },
  { name: 'Progrès', path: /\/progres$/, h1: 'Progrès' },
  { name: 'Réglages', path: /\/reglages$/, h1: 'Réglages' },
]

test('navigation par onglets', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('./')
  await completeOnboarding(page)

  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  await expect(nav.getByRole('link')).toHaveCount(4)

  await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest$/)

  for (const tab of tabs) {
    const link = nav.getByRole('link', { name: tab.name })
    await expect(link).toBeVisible()
    const box = await link.boundingBox()
    if (!box) throw new Error(`boundingBox nul pour ${tab.name}`)
    expect(box.height).toBeGreaterThanOrEqual(44)

    await link.click()
    await expect(page).toHaveURL(tab.path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tab.h1)
    await expect(link).toHaveAttribute('aria-current', 'page')
  }

  expect(errors).toEqual([])
})
