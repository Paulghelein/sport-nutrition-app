import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding, openTraining } from './helpers.ts'

const SHOTS = process.env['QA_SHOTS'] ?? 'test-results'

async function pick(page: Page, name: string) {
  const radio = page.getByRole('radio', { name })
  await page.locator('label').filter({ has: radio }).click()
}

interface Audit {
  small: string[]
  overflowX: boolean
  bottoms: Record<string, number>
}

/** Cibles interactives visibles < 44 px, débordement horizontal, bas des boutons nommés. */
async function audit(page: Page, names: string[]): Promise<Audit> {
  return page.evaluate((wanted) => {
    const small: string[] = []
    const bottoms: Record<string, number> = {}
    const els = document.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [role=radio]',
    )
    for (const el of els) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || el.closest('[aria-hidden=true]'))
        continue
      if (el.classList.contains('sr-only') || (el instanceof HTMLInputElement && el.type === 'radio'))
        continue
      const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)
      if (r.height < 43.5 || r.width < 43.5)
        small.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`)
      for (const w of wanted)
        if (label.startsWith(w)) bottoms[w] = Math.round(r.bottom * 10) / 10 + 0 * r.height
    }
    return {
      small,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      bottoms,
    }
  }, names)
}

test('J4 : mise en page 390x844 (cibles, défilement horizontal, bouton principal visible)', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  await page.clock.install()
  await page.goto('./')
  await completeOnboarding(page)
  await openTraining(page)
  const report: Record<string, Audit> = {}
  const vh = page.viewportSize()?.height ?? 844

  await pick(page, '30 min')
  await page.getByRole('link', { name: 'Voir la séance' }).click()
  // Aperçu édité : remplace un exercice.
  const replace = page.getByRole('button', { name: /^Remplacer / }).first()
  await replace.click()
  const choices = page.getByRole('dialog').locator('li button')
  if ((await choices.count()) > 0) await choices.first().click()
  else await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByRole('button', { name: 'Commencer la séance' })).toBeVisible()
  report['aperçu'] = await audit(page, ['Commencer la séance'])
  await page.screenshot({ path: `${SHOTS}/qa-j4-apercu.png`, fullPage: true })
  await page.getByRole('button', { name: 'Commencer la séance' }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()

  await expect(page.getByRole('button', { name: 'Correct', exact: true })).toBeVisible()
  report['série'] = await audit(page, ['Facile', 'Correct', 'Difficile'])
  await page.screenshot({ path: `${SHOTS}/qa-j4-serie.png` })
  await page.getByRole('button', { name: 'Correct', exact: true }).click()

  const timer = page.getByRole('timer', { name: 'Temps de repos restant' })
  await expect(timer).toBeVisible()
  await page.waitForTimeout(700)
  report['repos'] = await audit(page, ['Passer le repos', 'Série suivante'])
  await page.screenshot({ path: `${SHOTS}/qa-j4-repos.png` })

  for (let i = 0; i < 120; i++) {
    if (await page.getByRole('button', { name: 'Terminer la séance' }).isVisible()) break
    if (await page.getByRole('button', { name: /Passer le repos|Série suivante/ }).isVisible())
      await page.getByRole('button', { name: /Passer le repos|Série suivante/ }).click()
    else await page.getByRole('button', { name: 'Correct', exact: true }).click()
  }
  report['fin'] = await audit(page, ['Terminer la séance'])
  await page.screenshot({ path: `${SHOTS}/qa-j4-fin.png` })
  await page.getByRole('button', { name: 'Terminer la séance' }).click()
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()
  report['récap'] = await audit(page, ['Terminé'])
  await page.screenshot({ path: `${SHOTS}/qa-j4-recap.png`, fullPage: true })
  await page.getByRole('button', { name: 'Terminé' }).click()

  await page.getByRole('link', { name: 'Historique' }).click()
  await expect(page.getByText('Terminée', { exact: true })).toBeVisible()
  report['historique'] = await audit(page, [])
  await page.screenshot({ path: `${SHOTS}/qa-j4-historique.png`, fullPage: true })
  await page.locator('a[href*="/entrainement/historique/"]').first().click()
  await page.getByRole('button', { name: 'Corriger les séries' }).click()
  report['historique-détail'] = await audit(page, [])
  await page.screenshot({ path: `${SHOTS}/qa-j4-historique-detail.png`, fullPage: true })

  await page.goto('./entrainement/modeles')
  report['modèles'] = await audit(page, [])
  await page.screenshot({ path: `${SHOTS}/qa-j4-modeles.png`, fullPage: true })

  console.log('AUDIT ' + JSON.stringify(report, null, 1))
  for (const [k, a] of Object.entries(report)) {
    expect.soft(a.overflowX, `défilement horizontal : ${k}`).toBe(false)
    expect.soft(a.small, `cibles < 44 px : ${k}`).toEqual([])
  }
  for (const k of ['série', 'repos', 'fin']) {
    for (const [name, bottom] of Object.entries(report[k]?.bottoms ?? {}))
      expect.soft(bottom, `${k} : « ${name} » visible sans défiler`).toBeLessThanOrEqual(vh)
  }
  expect(errors).toEqual([])
})
