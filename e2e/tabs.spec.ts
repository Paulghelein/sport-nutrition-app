import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { completeOnboarding } from './helpers.ts'

const tabs = [
  { name: 'Aujourd’hui', path: /\/$/, h1: 'Aujourd’hui' },
  { name: 'Entraînement', path: /\/entrainement$/, h1: /^Entraînement$/ },
  { name: 'Nutrition', path: /\/nutrition$/, h1: 'Nutrition' },
  { name: 'Progrès', path: /\/progres$/, h1: 'Progrès' },
]

const navOf = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' })

test('navigation par onglets', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('./')
  await completeOnboarding(page)

  const nav = navOf(page)
  // 4 onglets (Réglages n'en est plus un) + le bouton « Ajouter ».
  await expect(nav.getByRole('link')).toHaveCount(4)
  await expect(nav.getByRole('link', { name: 'Réglages' })).toHaveCount(0)
  await expect(nav.getByRole('button', { name: 'Ajouter' })).toBeVisible()

  await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest$/)

  for (const tab of [...tabs.slice(1), ...tabs.slice(0, 1)]) {
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

  // Réglages : icône en haut à droite de l'accueil, onglet Aujourd'hui resté allumé.
  await page.getByRole('link', { name: 'Réglages' }).click()
  await expect(page).toHaveURL(/\/reglages$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Réglages')

  expect(errors).toEqual([])
})

// Régression J3 (adaptée R1) : la barre, désormais `fixed` et flottante, doit avoir la même position et la même
// taille sur toutes les routes à onglets, rester dans l'écran, et le document ne doit jamais défiler (seul <main>
// défile), même après le focus d'un radio masqué (ChoiceGroup).
test('barre d’onglets identique sur tous les écrans', async ({ page }) => {
  await page.goto('./')
  await completeOnboarding(page)
  const routes = [
    '',
    'entrainement',
    'entrainement/apercu?duree=30',
    'entrainement/exercices',
    'entrainement/exercices/goblet-squat',
    'entrainement/exercices/nouveau',
    'entrainement/historique',
    'nutrition',
    'nutrition/recettes',
    'nutrition/frigo',
    'nutrition/courses',
    'progres',
    'reglages',
    'reglages/importer',
  ]
  const nav = navOf(page)
  let reference: { y: number; height: number; width: number } | undefined
  for (const r of routes) {
    await page.goto(`./${r}`)
    await expect(nav).toBeVisible()
    await page.waitForLoadState('networkidle')
    const box = await nav.boundingBox()
    if (!box) throw new Error(`barre absente sur /${r}`)
    const metrics = { y: Math.round(box.y), height: Math.round(box.height), width: Math.round(box.width) }
    reference ??= metrics
    expect(metrics, `/${r}`).toEqual(reference)
    const viewport = await page.evaluate(() => window.innerHeight)
    // Flottante : entièrement visible, à moins de 60 px du bord bas.
    expect(box.y + box.height, `barre hors écran sur /${r}`).toBeLessThanOrEqual(viewport)
    expect(box.y + box.height, `barre trop haute sur /${r}`).toBeGreaterThanOrEqual(viewport - 60)
    const fixed = await page.evaluate(() => {
      const n = document.querySelector('nav[aria-label="Navigation principale"]')
      return n?.parentElement ? getComputedStyle(n.parentElement).position : null
    })
    expect(fixed, `barre non fixed sur /${r}`).toBe('fixed')
    const doc = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      inner: window.innerHeight,
    }))
    expect(doc.height, `document plus haut que l’écran sur /${r}`).toBeLessThanOrEqual(doc.inner)
  }

  // Le focus d'un radio en bas d'un long formulaire ne doit pas faire défiler le document.
  await page.goto('./entrainement/exercices/nouveau')
  const radios = page.locator('input[type="radio"]')
  await radios.last().focus()
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0)
  const box = await nav.boundingBox()
  expect(Math.round(box?.y ?? -1)).toBe(reference?.y)
})
