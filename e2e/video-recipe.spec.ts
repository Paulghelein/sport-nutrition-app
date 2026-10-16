import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { collectErrors, completeOnboarding } from './helpers.ts'

const TIKTOK = 'https://www.tiktok.com/@chef/video/7312345678901234567?is_from_webapp=1&sender_device=pc'
const CLEAN = 'https://www.tiktok.com/@chef/video/7312345678901234567'

/** Presse-papiers en mémoire (WebKit n'accorde pas les permissions) ; `readText` refuse pour tester la zone de collage. */
async function stubClipboard(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __clip: string; __opened: string[] }
    w.__clip = ''
    w.__opened = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (t: string) => {
          w.__clip = t
          return Promise.resolve()
        },
        readText: () => Promise.reject(new Error('refusé')),
      },
    })
    // Aucune vraie fenêtre : on note l'URL et on rend un objet factice (non nul = ouverture réussie).
    window.open = ((url?: string | URL) => {
      w.__opened.push(String(url))
      return {} as Window
    }) as typeof window.open
  })
}

const state = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __clip: string; __opened: string[] }
    return { clip: w.__clip, opened: w.__opened }
  })

test('recette d’une vidéo : lien collé, message copié, Claude ouvert, réponse importée', async ({
  page,
  context,
}) => {
  await stubClipboard(context)
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await page.waitForLoadState('networkidle')
  await page.goto('./nutrition/recette-video')
  await expect(page.getByRole('heading', { name: 'Recette d’une vidéo' })).toBeVisible()
  await page.waitForLoadState('networkidle')

  // Lecture refusée : la zone de collage apparaît avec un message.
  await page.getByRole('button', { name: 'Coller le lien' }).click()
  await expect(page.getByText('Lecture du presse-papiers refusée')).toBeVisible()
  await page.getByLabel('Lien de la vidéo').fill(`Ma recette préférée ${TIKTOK}`)

  await expect(page.getByLabel('Vidéo détectée')).toContainText('TikTok')
  await expect(page.getByLabel('Vidéo détectée')).toContainText(CLEAN)
  const preview = page.getByLabel(/Message qui sera copié/)
  await expect(preview).toHaveValue(new RegExp(CLEAN.replace(/[.]/g, '\\.')))
  await expect(preview).not.toHaveValue(/is_from_webapp/)

  await page.getByLabel('Ta demande (facultatif)').fill('version sans lactose')
  await expect(preview).toHaveValue(/version sans lactose/)

  await page.getByRole('button', { name: 'Copier et ouvrir Claude' }).click()
  await expect(page.getByRole('status')).toContainText('Message copié')
  const s = await state(page)
  expect(s.clip).toContain(CLEAN)
  expect(s.clip).toContain('version sans lactose')
  expect(s.opened).toHaveLength(1)
  expect(s.opened[0]).toMatch(/^https:\/\/claude\.ai\//)

  await page.getByRole('link', { name: 'Coller la réponse' }).click()
  await expect(page.getByRole('heading', { name: 'Réponse de Claude' })).toBeVisible()

  const recipe = {
    type: 'recipe',
    name: 'Pâtes crémeuses de la vidéo',
    meal: ['dejeuner'],
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 15,
    ingredients: [
      { name: 'Pâtes crues', grams: 200, aisle: 'epicerie' },
      { name: 'Poulet cru', grams: 300, aisle: 'boucherie' },
    ],
    steps: ['Cuire les pâtes.', 'Saisir le poulet.', 'Mélanger.'],
  }
  await page.getByLabel('Réponse à analyser').fill('```json\n' + JSON.stringify(recipe) + '\n```')
  await page.getByRole('button', { name: 'Analyser' }).click()
  await expect(page.getByRole('heading', { name: 'Aperçu' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Pâtes crémeuses de la vidéo').first()).toBeVisible()
  await page.getByRole('button', { name: 'Appliquer' }).click()
  await expect(page.getByRole('status')).toContainText(/recette/i)

  await page.goto('./nutrition/recettes')
  await expect(page.getByText('Pâtes crémeuses de la vidéo').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('recette d’une vidéo : texte sans lien = message d’erreur, aucun message à copier', async ({
  page,
  context,
}) => {
  await stubClipboard(context)
  await page.goto('./')
  await completeOnboarding(page)
  await page.goto('./nutrition/recette-video')
  await page.getByRole('button', { name: 'Coller le lien' }).click()
  await page.getByLabel('Lien de la vidéo').fill('juste du texte, pas de lien')
  await expect(page.getByText('Aucun lien de vidéo trouvé')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copier et ouvrir Claude' })).toBeHidden()
})
