import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding } from './helpers.ts'

const CHICKEN = 'Poulet, riz basmati et brocoli sauce soja'
const MIN = 44

/** Éléments interactifs visibles plus petits que 44 px (hors contrôles sr-only, dont l'étiquette est mesurée). */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const out: string[] = []
    const sel = 'a[href], button, select, textarea, input, [role="checkbox"], [role="switch"], [role="radio"]'
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || r.height === 0) continue
      // sr-only : 1 x 1 px, la cible réelle est l'étiquette parente.
      if (r.width <= 2 && r.height <= 2) continue
      if (el.closest('[aria-hidden="true"]')) continue
      // Case à cocher dans une étiquette (carte entière cliquable) : la cible est l'étiquette.
      const wrapper = el instanceof HTMLInputElement ? el.closest('label') : null
      if (wrapper) {
        const lr = wrapper.getBoundingClientRect()
        if (lr.width >= min && lr.height >= min) continue
      }
      // Lien court dans un message de confirmation (role=status) : hauteur 44 px suffisante, largeur = texte.
      if (el.tagName === 'A' && el.closest('[role="status"]') && r.height >= min - 0.5) continue
      if (r.width < min - 0.5 || r.height < min - 0.5) {
        const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? ''
        out.push(`${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    }
    return out
  }, MIN)
}

async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const de = document.documentElement
    if (de.scrollWidth > de.clientWidth) out.push(`document ${de.scrollWidth} > ${de.clientWidth}`)
    const main = document.querySelector('main')
    if (main && main.scrollWidth > main.clientWidth)
      out.push(`main ${main.scrollWidth} > ${main.clientWidth}`)
    return out
  })
}

async function check(page: Page, name: string, problems: string[], bar = true) {
  for (const o of await overflow(page)) problems.push(`[${name}] débordement : ${o}`)
  for (const s of await smallTargets(page)) problems.push(`[${name}] cible < ${MIN} px : ${s}`)
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  if (!bar) {
    // Mode cuisine : plein écran, la barre flottante est masquée.
    if ((await nav.count()) > 0) problems.push(`[${name}] barre d’onglets présente en mode cuisine`)
    return
  }
  // Barre flottante (fixed) : visible et entièrement dans l'écran, au-dessus du bord bas.
  const box = await nav.boundingBox()
  const vh = page.viewportSize()?.height ?? 844
  if (!box || box.y + box.height > vh + 1 || box.y + box.height < vh - 60)
    problems.push(`[${name}] barre d’onglets absente ou mal placée`)
}

test('recettes : pas de débordement, cibles >= 44 px, barre d’onglets en place (390x844)', async ({
  page,
}) => {
  const errors = collectErrors(page)
  const problems: string[] = []
  await page.goto('./')
  await completeOnboarding(page)
  await page.waitForLoadState('networkidle')
  await page.goto('./nutrition/recettes')
  await expect(page.getByRole('link', { name: new RegExp(CHICKEN) })).toBeVisible({ timeout: 40_000 })
  await check(page, 'liste', problems)

  await page.getByRole('button', { name: /^Filtres/ }).click()
  await check(page, 'liste + filtres', problems)
  await page.getByRole('button', { name: /^Filtres/ }).click()

  await page.getByRole('link', { name: new RegExp(CHICKEN) }).click()
  await expect(page.getByRole('heading', { level: 1, name: CHICKEN })).toBeVisible()
  await check(page, 'fiche', problems)

  await page.getByRole('button', { name: 'Préparer pour le frigo' }).click()
  await check(page, 'feuille frigo', problems)
  await page.getByRole('button', { name: 'Mettre au frigo' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'au frigo' })).toBeVisible()

  await page.getByRole('button', { name: 'Loguer une portion', exact: true }).click()
  await check(page, 'feuille loguer', problems)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Ajouter aux courses' }).click()
  await check(page, 'feuille courses', problems)
  await page.keyboard.press('Escape')

  await page.getByRole('link', { name: 'Modifier', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Modifier la recette' })).toBeVisible()
  await check(page, 'formulaire', problems)
  await page.goBack()

  await page.getByRole('link', { name: 'Cuisiner' }).click()
  await expect(page.getByLabel('Portions à cuisiner : 4')).toBeVisible()
  await check(page, 'cuisine ingrédients', problems, false)
  await page.getByRole('button', { name: 'Voir les étapes' }).click()
  await check(page, 'cuisine étapes', problems, false)

  await page.goto('./nutrition/frigo')
  await expect(page.getByTestId('fridge-left')).toBeVisible()
  await check(page, 'frigo', problems)

  await page.goto('./nutrition/courses')
  await page.getByRole('button', { name: 'Choisir les recettes' }).click()
  await check(page, 'courses : choix', problems)
  await page.getByRole('button', { name: `Ajouter ${CHICKEN}` }).click()
  await page.getByRole('button', { name: /^Générer la liste/ }).click()
  await expect(page.getByTestId('shopping-progress')).toBeVisible()
  await check(page, 'courses', problems)

  await page.goto('./reglages/importer')
  await check(page, 'import', problems)
  await page.getByLabel('Texte à importer').fill(
    JSON.stringify([
      { type: 'recipe', name: 'X', servings: 'a' },
      {
        type: 'recipe',
        name: 'Layout test',
        meal: ['dejeuner'],
        servings: 2,
        prepMinutes: 5,
        cookMinutes: 5,
        ingredients: [
          {
            name: 'Riz',
            grams: 200,
            aisle: 'epicerie',
            per100g: { kcal: 350, protein: 7, carbs: 77, fat: 1 },
          },
        ],
        steps: ['Cuire.'],
      },
    ]),
  )
  await page.getByRole('button', { name: 'Analyser' }).click()
  await expect(page.getByRole('heading', { name: 'Aperçu' })).toBeVisible({ timeout: 40_000 })
  await check(page, 'import aperçu', problems)

  await page.goto('./reglages')
  await check(page, 'réglages', problems)

  expect(problems).toEqual([])
  expect(errors).toEqual([])
})
