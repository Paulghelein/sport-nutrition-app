import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { collectErrors, completeOnboarding, openTraining } from './helpers.ts'

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' })
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Ajouter', exact: true })
const CHICKEN = 'Poulet, riz basmati et brocoli sauce soja'

/** 12:30 : le repas ciblé par défaut est le déjeuner (slotForNow : < 10 h petit-déj., < 15 h déjeuner, < 18 h collation). */
const NOON = new Date('2026-10-15T12:30:00')

async function boot(page: Page, at: Date = NOON): Promise<string[]> {
  const errors = collectErrors(page)
  await page.clock.setFixedTime(at)
  await page.goto('./')
  await completeOnboarding(page)
  await page.waitForLoadState('networkidle')
  return errors
}

/** Presse-papiers en mémoire : `window.__writes` compte les copies (WebKit n'accorde pas la permission). */
async function stubClipboard(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __clip: string; __writes: number }
    w.__clip = ''
    w.__writes = 0
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (t: string) => {
          w.__clip = t
          w.__writes += 1
          return Promise.resolve()
        },
        readText: () => Promise.resolve(w.__clip),
      },
    })
  })
}
const writes = (page: Page) => page.evaluate(() => (window as unknown as { __writes: number }).__writes)

async function openSheet(page: Page): Promise<void> {
  await nav(page).getByRole('button', { name: 'Ajouter' }).click()
  await expect(sheet(page)).toBeVisible()
}

async function tapSheet(page: Page, name: string | RegExp): Promise<void> {
  const button =
    typeof name === 'string'
      ? sheet(page).getByRole('button', { name, exact: true })
      : sheet(page).getByRole('button', { name })
  await button.click()
}

type Tab = 'Aujourd’hui' | 'Entraînement' | 'Nutrition' | 'Progrès'
const TABS: Tab[] = ['Aujourd’hui', 'Entraînement', 'Nutrition', 'Progrès']

async function goTab(page: Page, tab: Tab): Promise<void> {
  await nav(page).getByRole('link', { name: tab }).click()
  await expect(nav(page).getByRole('link', { name: tab })).toHaveAttribute('aria-current', 'page')
}

/** Lance une séance guidée puis la met en pause : il reste une séance en cours. */
async function startAndPauseSession(page: Page): Promise<void> {
  await openTraining(page)
  await page.getByRole('link', { name: 'Voir la séance' }).click()
  await page.getByRole('button', { name: 'Commencer la séance' }).click()
  await expect(page).toHaveURL(/\/entrainement\/seance$/)
  await page.getByRole('button', { name: 'C’est parti' }).click()
  await page.getByRole('button', { name: 'Quitter' }).click()
  await page.getByRole('button', { name: 'Mettre en pause' }).click()
  await expect(page).toHaveURL(/\/entrainement$/)
}

test.describe('écran Aujourd’hui', () => {
  test('séance du jour (titre, raison, aperçu avec le même nombre d’exercices) et carte calories', async ({
    page,
  }) => {
    const errors = await boot(page)
    const card = page
      .getByRole('region', { name: 'Séance du jour' })
      .or(page.locator('[aria-label="Séance du jour"]'))
    await expect(card.first()).toBeVisible()
    await expect(card.first().getByRole('heading', { level: 2 })).not.toBeEmpty()
    const cta = card.first().getByRole('link', { name: /^Voir la séance · \d+ exercices?$/ })
    await expect(cta).toBeVisible()
    const count = Number(/(\d+) exercice/.exec((await cta.textContent()) ?? '')?.[1])
    await cta.click()
    await expect(page).toHaveURL(/\/entrainement\/apercu\?duree=\d+$/)
    await expect(page.getByRole('button', { name: 'Commencer la séance' })).toBeVisible()
    await expect(page.locator('a[href*="/entrainement/exercices/"]')).toHaveCount(count)

    await goTab(page, 'Aujourd’hui')
    await page.getByRole('link', { name: /^Calories du jour/ }).click()
    await expect(page).toHaveURL(/\/nutrition$/)
    expect(errors).toEqual([])
  })
})

test.describe('anciennes adresses et route inconnue', () => {
  test('/seance, /seance/exercices?x=1#h et route inconnue', async ({ page }) => {
    const errors = await boot(page)

    await page.goto('./seance')
    await expect(page).toHaveURL(/\/entrainement$/)
    await expect(nav(page).getByRole('link', { name: 'Entraînement' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // Chemin, query et hash conservés.
    await page.goto('./seance/exercices?x=1#h')
    await expect(page).toHaveURL(/\/entrainement\/exercices\?x=1#h$/)
    await expect(page.getByRole('heading', { name: 'Exercices', level: 1 })).toBeVisible()

    await page.goto('./seance/exercices/goblet-squat')
    await expect(page).toHaveURL(/\/entrainement\/exercices\/goblet-squat$/)

    await page.goto('./nimporte/quoi')
    await expect(page).toHaveURL(/\/sport-nutrition-app\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Aujourd’hui' })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('/seance/en-cours : sans séance, écran « Aucune séance en cours » ; avec séance, mode séance', async ({
    page,
  }) => {
    const errors = await boot(page)

    // Aucune séance : l'écran du mode séance propose de retourner à Entraînement (pas de barre, pas d'écran blanc).
    await page.goto('./seance/en-cours')
    await expect(page).toHaveURL(/\/entrainement\/seance$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Aucune séance en cours' })).toBeVisible()
    await page.getByRole('link', { name: /^Aller à / }).click()
    await expect(page).toHaveURL(/\/entrainement$/)
    await expect(nav(page)).toBeVisible()

    await startAndPauseSession(page)
    await page.goto('./seance/en-cours')
    await expect(page).toHaveURL(/\/entrainement\/seance$/)
    await expect(nav(page)).toHaveCount(0)
    expect(errors).toEqual([])
  })
})

test.describe('feuille Ajouter', () => {
  test('depuis chaque onglet : s’ouvre, repas déduit de l’heure, Scanner mène au scanner', async ({
    page,
  }) => {
    // Sans caméra : la page du scanner ne demande pas getUserMedia (sinon erreur console à la fermeture du test).
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    })
    const errors = await boot(page)
    for (const tab of TABS) {
      await goTab(page, tab)
      await openSheet(page)
      await expect(sheet(page).getByRole('button', { name: /^Repas au déjeuner/ })).toBeVisible()
      await tapSheet(page, 'Scanner')
      await expect(page).toHaveURL(/\/nutrition\/scanner\?repas=lunch$/)
      await expect(page.getByRole('heading', { name: 'Scanner un produit' })).toBeVisible()
      await expect(sheet(page)).toHaveCount(0)
      await expect(nav(page).getByRole('link', { name: 'Nutrition' })).toHaveAttribute('aria-current', 'page')
    }
    expect(errors).toEqual([])
  })

  test('repas selon l’heure, modifiable, et repris dans l’URL de destination', async ({ page }) => {
    const errors = await boot(page)
    const cases: [string, RegExp, string][] = [
      ['2026-10-15T08:00:00', /^Repas au petit-déjeuner/, 'breakfast'],
      ['2026-10-15T12:30:00', /^Repas au déjeuner/, 'lunch'],
      ['2026-10-15T16:00:00', /^Repas à la collation/, 'snack'],
      ['2026-10-15T20:00:00', /^Repas au dîner/, 'dinner'],
    ]
    for (const [time, label, slot] of cases) {
      await page.clock.setFixedTime(new Date(time))
      await openSheet(page)
      await expect(sheet(page).getByRole('button', { name: label })).toBeVisible()
      await tapSheet(page, 'Chercher')
      await expect(page).toHaveURL(new RegExp(`/nutrition/ajouter\\?repas=${slot}$`))
      await page.goBack()
    }

    // Changement manuel : dîner alors qu'il est midi.
    await page.clock.setFixedTime(NOON)
    await goTab(page, 'Aujourd’hui')
    await openSheet(page)
    await sheet(page)
      .getByRole('button', { name: /^Repas au déjeuner/ })
      .click()
    await sheet(page).getByRole('radiogroup', { name: 'Repas' }).getByRole('radio', { name: 'dîner' }).click()
    await expect(sheet(page).getByRole('button', { name: /^Repas au dîner/ })).toBeVisible()
    await tapSheet(page, 'Chercher')
    await expect(page).toHaveURL(/\/nutrition\/ajouter\?repas=dinner$/)
    await expect(page.getByRole('heading', { name: /Ajouter au dîner/ })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('Chercher, Recette ou frigo, Saisie rapide : bon écran, bonne feuille, repas dans l’URL', async ({
    page,
  }) => {
    const errors = await boot(page)

    await goTab(page, 'Progrès')
    await openSheet(page)
    await tapSheet(page, 'Chercher')
    await expect(page).toHaveURL(/\/nutrition\/ajouter\?repas=lunch$/)
    await expect(page.getByRole('heading', { name: 'Ajouter au déjeuner' })).toBeVisible()
    await expect(page.getByRole('searchbox', { name: 'Rechercher un aliment' })).toBeVisible()

    await goTab(page, 'Entraînement')
    await openSheet(page)
    await tapSheet(page, 'Recette ou frigo')
    await expect(page.getByRole('dialog', { name: 'Portion de recette' })).toBeVisible()
    await expect(page).toHaveURL(/\/nutrition\/ajouter\?repas=lunch$/)
    await page.keyboard.press('Escape')

    await goTab(page, 'Aujourd’hui')
    await openSheet(page)
    await tapSheet(page, 'Saisie rapide')
    await expect(page.getByRole('dialog', { name: 'Saisie libre' })).toBeVisible()
    await expect(page).toHaveURL(/\/nutrition\/ajouter\?repas=lunch$/)
    expect(errors).toEqual([])
  })

  test('Décrire à Claude : aperçu d’envoi ouvert, rien copié tant qu’on ne touche pas Copier', async ({
    page,
    context,
  }) => {
    await stubClipboard(context)
    const errors = await boot(page)
    await goTab(page, 'Progrès')
    await openSheet(page)
    await tapSheet(page, 'Décrire à Claude')
    await expect(page).toHaveURL(/\/nutrition(\?.*)?$/)
    const preview = page.getByRole('dialog', { name: 'Demander à Claude' })
    await expect(preview).toBeVisible()
    await expect(preview.getByLabel(/Message qui sera copié/)).not.toBeEmpty()
    expect(await writes(page)).toBe(0)
    // Un rechargement ne rouvre pas l'aperçu : le paramètre est nettoyé.
    expect(page.url()).not.toContain('claude=1')
    expect(errors).toEqual([])
  })

  test('Pesée : feuille de pesée, puis la pesée apparaît dans Progrès', async ({ page }) => {
    const errors = await boot(page)
    await goTab(page, 'Entraînement')
    await openSheet(page)
    await tapSheet(page, 'Pesée')
    await expect(sheet(page)).toHaveCount(0)
    const dialog = page.getByRole('dialog', { name: 'Ajouter une pesée' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Poids').fill('74,1')
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(dialog).toBeHidden()

    await goTab(page, 'Progrès')
    await expect(page.getByRole('button', { name: /^Modifier la pesée .*74,1 kg$/ })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('Démarrer une séance : aperçu, puis mode séance quand une séance est en cours', async ({ page }) => {
    const errors = await boot(page)
    await goTab(page, 'Nutrition')
    await openSheet(page)
    await page.getByRole('button', { name: 'Démarrer une séance' }).click()
    await expect(page).toHaveURL(/\/entrainement\/apercu\?duree=\d+$/)
    await expect(page.getByRole('heading', { name: 'Aperçu', level: 1 })).toBeVisible()

    await page.getByRole('button', { name: 'Commencer la séance' }).click()
    await expect(page).toHaveURL(/\/entrainement\/seance$/)
    await page.getByRole('button', { name: 'C’est parti' }).click()
    await page.getByRole('button', { name: 'Quitter' }).click()
    await page.getByRole('button', { name: 'Mettre en pause' }).click()
    await expect(page).toHaveURL(/\/entrainement$/)

    await goTab(page, 'Progrès')
    await openSheet(page)
    await page.getByRole('button', { name: 'Démarrer une séance' }).click()
    await expect(page).toHaveURL(/\/entrainement\/seance$/)
    await expect(nav(page)).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('Créer et Autres : chaque entrée mène au bon écran', async ({ page }) => {
    const errors = await boot(page)
    const entries: [Tab, string | RegExp, RegExp, string | RegExp][] = [
      ['Aujourd’hui', 'Nouvelle recette', /\/nutrition\/recettes\/nouvelle$/, 'Nouvelle recette'],
      ['Entraînement', 'Nouvel aliment', /\/nutrition\/aliments\/nouveau$/, 'Créer un aliment'],
      ['Nutrition', /Réponse de Claude/, /\/claude\/reponse$/, 'Réponse de Claude'],
      ['Progrès', /^Importer/, /\/reglages\/importer$/, 'Importer'],
    ]
    for (const [tab, label, url, h1] of entries) {
      await goTab(page, tab)
      await openSheet(page)
      await tapSheet(page, label)
      await expect(page).toHaveURL(url)
      await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible()
      await expect(nav(page)).toBeVisible()
    }

    await goTab(page, 'Nutrition')
    await openSheet(page)
    await tapSheet(page, 'Mensurations')
    await expect(page).toHaveURL(/\/progres#mensurations$/)
    await expect(page.getByRole('heading', { name: 'Mensurations' })).toBeInViewport()
    expect(errors).toEqual([])
  })

  test('Échap ferme la feuille sans rien changer', async ({ page }) => {
    const errors = await boot(page)
    await goTab(page, 'Nutrition')
    await openSheet(page)
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/nutrition$/)
    expect(errors).toEqual([])
  })
})

test.describe('barre d’onglets masquée', () => {
  test('mode séance : absente ; de retour sur Entraînement', async ({ page }) => {
    const errors = await boot(page)
    await openTraining(page)
    await page.getByRole('link', { name: 'Voir la séance' }).click()
    await expect(nav(page)).toBeVisible()
    await page.getByRole('button', { name: 'Commencer la séance' }).click()
    await expect(page).toHaveURL(/\/entrainement\/seance$/)
    await expect(page.getByRole('heading', { name: 'Échauffement' })).toBeVisible()
    await expect(nav(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ajouter', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'C’est parti' }).click()
    await expect(nav(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Quitter' }).click()
    await page.getByRole('button', { name: 'Mettre en pause' }).click()
    await expect(page).toHaveURL(/\/entrainement$/)
    await expect(nav(page)).toBeVisible()
    expect(errors).toEqual([])
  })

  test('mode cuisine : absente ; de retour sur la fiche recette', async ({ page }) => {
    const errors = await boot(page)
    await page.goto('./nutrition/recettes')
    await page.getByRole('link', { name: new RegExp(CHICKEN) }).click({ timeout: 40_000 })
    await expect(page.getByRole('heading', { level: 1, name: CHICKEN })).toBeVisible()
    await expect(nav(page)).toBeVisible()
    await page.getByRole('link', { name: 'Cuisiner' }).click()
    await expect(page).toHaveURL(/\/cuisine$/)
    await expect(page.getByLabel('Portions à cuisiner : 4')).toBeVisible()
    await expect(nav(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Voir les étapes' }).click()
    await expect(nav(page)).toHaveCount(0)
    await page.goBack()
    await expect(nav(page)).toBeVisible()
    expect(errors).toEqual([])
  })
})
