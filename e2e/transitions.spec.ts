import { expect, test } from '@playwright/test'
import { collectErrors, completeOnboarding } from './helpers.ts'

// Sans `reducedMotion` (le reste de la suite l'émule) : le vrai glissement doit se terminer proprement.
test.use({ reducedMotion: 'no-preference' })

test('transition d’écran : glissement à l’entrée, aucun transform résiduel, zone collante toujours collée', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)

  // PUSH vers une route plus profonde (Réglages) : une animation tourne sur l'enveloppe, pas sur <main>.
  await page.getByRole('link', { name: 'Réglages' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Réglages' })).toBeVisible()
  const sliding = await page.evaluate(() => {
    const el = document.querySelector('main [class*="ds-page-slide"]')
    return { found: el !== null, onMain: document.querySelector('main')?.className.includes('ds-page-slide') }
  })
  expect(sliding.found).toBe(true)
  expect(sliding.onMain).toBe(false)
  // Fin d'animation : plus aucune animation active, plus aucun transform sur l'enveloppe ni sur <main>.
  await page.waitForFunction(() => {
    const el =
      document.querySelector('main [class*="ds-page-slide"]') ?? document.querySelector('main > div > div')
    return el !== null && el.getAnimations().length === 0
  })
  const transforms = await page.evaluate(() => {
    const wrapper = document.querySelector('main > div > div')
    return [wrapper, document.querySelector('main')].map((e) =>
      e ? getComputedStyle(e).transform : 'absent',
    )
  })
  expect(transforms).toEqual(['none', 'none'])

  // Changement d'onglet : aucune enveloppe animée.
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Aujourd’hui' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Aujourd’hui' })).toBeVisible()
  expect(await page.locator('main [class*="ds-page-slide"]').count()).toBe(0)

  // Aperçu de séance (PUSH plus profond) : la zone collante du bas reste collée au bas de <main> après la transition.
  await page.getByRole('link', { name: /^Voir la séance · \d+ exercices?$/ }).click()
  await expect(page).toHaveURL(/\/entrainement\/apercu\?duree=\d+$/)
  const start = page.getByRole('button', { name: 'Démarrer', exact: true })
  await expect(start).toBeVisible()
  await page.waitForFunction(() => document.querySelector('main > div > div')?.getAnimations().length === 0)
  const gap = await page.evaluate(() => {
    const main = document.querySelector('main')
    const sticky = document.querySelector('main .sticky')
    if (!main || !sticky) return null
    const content = main.clientHeight - parseFloat(getComputedStyle(main).paddingBottom)
    return Math.round(content - (sticky.getBoundingClientRect().bottom - main.getBoundingClientRect().top))
  })
  // Collée au bas de la boîte de contenu de <main> (±2 px), même si la page est plus longue que l'écran.
  expect(gap).not.toBeNull()
  expect(Math.abs(gap ?? 99)).toBeLessThanOrEqual(2)
  expect(errors).toEqual([])
})

test('transitions : PUSH consécutifs et PUSH après retour réanimés ; rien au changement de jour ni sur un hash', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  // Noms des animations de page démarrées (les feuilles ont les leurs : on ne garde que les glissements).
  await page.evaluate(() => {
    const w = window as unknown as { __slides: string[] }
    w.__slides = []
    document.addEventListener(
      'animationstart',
      (e) => {
        if (e.animationName.startsWith('ds-page-slide')) w.__slides.push(e.animationName)
      },
      true,
    )
  })
  const slides = () => page.evaluate(() => (window as unknown as { __slides: string[] }).__slides.length)
  // Laisse passer deux images (l'animation démarre à la suivante), puis attend la fin de toutes les animations.
  const idle = async () => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    await page.waitForFunction(() => document.getAnimations().length === 0)
  }

  // Deux PUSH d'affilée : Réglages, puis Importer.
  await page.getByRole('link', { name: 'Réglages' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Réglages' })).toBeVisible()
  await expect.poll(slides).toBe(1)
  await idle()
  await page.getByRole('link', { name: 'Importer des recettes ou des repas' }).click()
  await expect(page).toHaveURL(/\/reglages\/importer$/)
  await expect.poll(slides).toBe(2)
  await idle()

  // Retour (POP) : aucune animation ; nouveau PUSH : réanimé.
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1, name: 'Réglages' })).toBeVisible()
  await idle()
  expect(await slides()).toBe(2)
  await page.getByRole('link', { name: 'Importer des recettes ou des repas' }).click()
  await expect(page).toHaveURL(/\/reglages\/importer$/)
  await expect.poll(slides).toBe(3)
  await idle()

  // Journal : ‹ › ne change que la query (même chemin), sans animation.
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Nutrition' })
    .click()
  await expect(page.getByRole('link', { name: 'Ajouter au repas : Déjeuner' })).toBeVisible()
  await idle()
  await page.getByRole('button', { name: 'Jour précédent' }).click()
  await expect(page).toHaveURL(/\?date=/)
  await idle()
  expect(await slides()).toBe(3)

  // Hash : « Mensurations » depuis Progrès reste sur /progres (même chemin) : pas d'animation.
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Progrès' })
    .click()
  await expect(page.getByRole('heading', { name: 'Mensurations' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: 'Ajouter' })
    .click()
  await page
    .getByRole('dialog', { name: 'Ajouter', exact: true })
    .getByRole('button', { name: 'Mensurations', exact: true })
    .click()
  await expect(page).toHaveURL(/\/progres#mensurations$/)
  await idle()
  expect(await slides()).toBe(3)
  expect(errors).toEqual([])
})
