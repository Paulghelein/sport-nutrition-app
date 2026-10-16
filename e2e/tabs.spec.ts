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

// Régression J3 : la barre d'onglets doit avoir la même position et la même taille sur tous les écrans, et le
// document ne doit jamais défiler (seul <main> défile), même après le focus d'un radio masqué (ChoiceGroup).
test('barre d’onglets identique sur tous les écrans', async ({ page }) => {
  await page.goto('./')
  await completeOnboarding(page)
  const routes = [
    'seance',
    'seance/apercu?duree=30',
    'seance/exercices',
    'seance/exercices/goblet-squat',
    'seance/exercices/nouveau',
    'seance/historique',
    'nutrition',
    'nutrition/recettes',
    'nutrition/frigo',
    'nutrition/courses',
    'progres',
    'reglages',
    'reglages/importer',
  ]
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  let reference: { y: number; height: number; width: number } | undefined
  for (const r of routes) {
    await page.goto(`./${r}`)
    await expect(nav).toBeVisible()
    await page.waitForLoadState('networkidle')
    const box = await nav.boundingBox()
    if (!box) throw new Error(`barre absente sur ${r}`)
    const metrics = { y: Math.round(box.y), height: Math.round(box.height), width: Math.round(box.width) }
    reference ??= metrics
    expect(metrics, r).toEqual(reference)
    // Collée au bas de l'écran (correctif fixed inset-0 du 16/10 : en standalone iOS, height: 100% s'arrêtait avant).
    const viewport = await page.evaluate(() => window.innerHeight)
    expect(Math.round(box.y + box.height), `barre décollée du bas sur ${r}`).toBe(viewport)
    const doc = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      inner: window.innerHeight,
    }))
    expect(doc.height, `document plus haut que l’écran sur ${r}`).toBeLessThanOrEqual(doc.inner)
  }

  // Le focus d'un radio en bas d'un long formulaire ne doit pas faire défiler le document.
  await page.goto('./seance/exercices/nouveau')
  const radios = page.locator('input[type="radio"]')
  await radios.last().focus()
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0)
  const box = await nav.boundingBox()
  expect(Math.round(box?.y ?? -1)).toBe(reference?.y)
})
