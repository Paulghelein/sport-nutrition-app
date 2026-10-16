import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { collectErrors, completeOnboarding, localDate } from './helpers.ts'

/** Évite d'interrompre un chunk lazy en cours de chargement. */
const settle = (page: Page) => page.waitForLoadState('networkidle')

/**
 * WebKit n'accorde pas les permissions du presse-papiers dans Playwright : on remplace `navigator.clipboard` par un
 * magasin en mémoire (`window.__clip`), lu et écrit par les tests. Les appels (écriture, lecture) sont comptés.
 */
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

const clip = (page: Page) => page.evaluate(() => (window as unknown as { __clip: string }).__clip)
const setClip = (page: Page, text: string) =>
  page.evaluate((t) => ((window as unknown as { __clip: string }).__clip = t), text)

/** Les fenêtres ouvertes vers claude.ai n'ont pas besoin du réseau. */
async function stubClaudeSite(context: BrowserContext): Promise<void> {
  await context.route('https://claude.ai/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Claude</title>' }),
  )
}

async function start(page: Page, context: BrowserContext): Promise<string[]> {
  await stubClipboard(context)
  await stubClaudeSite(context)
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await settle(page)
  return errors
}

async function openResponseScreen(page: Page): Promise<void> {
  await page.goto('./claude/reponse')
  await expect(page.getByRole('heading', { name: 'Réponse de Claude' })).toBeVisible()
  await settle(page)
}

async function pasteAndAnalyse(page: Page, response: string): Promise<void> {
  await setClip(page, response)
  await page.getByRole('button', { name: 'Coller depuis le presse-papiers' }).click()
  await expect(page.getByRole('heading', { name: 'Aperçu' })).toBeVisible({ timeout: 30_000 })
}

test('journal : Demander à Claude montre le message, le copie et ouvre Claude', async ({ page, context }) => {
  const errors = await start(page, context)
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Nutrition' })
    .click()
  await page.getByRole('link', { name: 'Ajouter au repas : Déjeuner' }).click()
  await page.getByRole('button', { name: 'Saisie libre' }).click()
  const free = page.getByRole('dialog', { name: 'Saisie libre' })
  await free.getByLabel('Nom').fill('Pizza maison')
  await free.getByLabel('Calories').fill('800')
  await free.getByRole('button', { name: 'Ajouter' }).click()
  await expect(free).toBeHidden()
  await page.getByRole('button', { name: /^Terminer/ }).click()

  await page.getByRole('button', { name: 'Demander à Claude' }).click()
  const sheet = page.getByRole('dialog', { name: 'Demander à Claude' })
  const message = sheet.getByLabel(/Message qui sera copié/)
  await expect(message).toHaveValue(/Journal alimentaire/)
  await expect(message).toHaveValue(/Pizza maison/)
  await expect(message).toHaveValue(/Profil : homme/)
  await expect(message).toHaveValue(/Ma demande : Analyse ma journée/)
  // Rien n'a été copié avant le tap.
  expect(await clip(page)).toBe('')

  await sheet.getByLabel('Ta demande').fill('Que manger ce soir ?')
  await expect(message).toHaveValue(/Ma demande : Que manger ce soir \?/)
  const shown = await message.inputValue()

  const popup = page.waitForEvent('popup')
  await sheet.getByRole('button', { name: 'Copier et ouvrir Claude' }).click()
  const opened = await popup
  expect(opened.url()).toBe('https://claude.ai/new')
  expect(await clip(page)).toBe(shown)
  await expect(sheet.getByRole('status')).toContainText('Message copié')

  await sheet.getByRole('link', { name: /coller la réponse/ }).click()
  await expect(page.getByRole('heading', { name: 'Réponse de Claude' })).toBeVisible()
  expect(errors).toEqual([])
})

test('réponse avec un repas : aperçu, application, macros figées au journal', async ({ page, context }) => {
  const errors = await start(page, context)
  await openResponseScreen(page)
  const date = localDate(0)
  const response = [
    'Voici une estimation.',
    '```json',
    JSON.stringify([
      {
        type: 'meal',
        name: 'Burger resto',
        date,
        slot: 'dejeuner',
        estimated: true,
        totals: { kcal: 900, protein: 40, carbs: 80, fat: 45 },
      },
      { type: 'weird', foo: 1 },
    ]),
    '```',
  ].join('\n')
  await pasteAndAnalyse(page, response)
  await expect(page.getByText('Burger resto', { exact: true })).toBeVisible()
  const box = page.getByRole('checkbox', { name: 'Ajouter le repas Burger resto au journal' })
  await expect(box).toBeChecked()
  await expect(page.getByText('Élément 2 invalide')).toBeVisible()
  await page.getByRole('button', { name: 'Appliquer' }).click()
  await expect(page.getByRole('status')).toContainText('1 repas ajouté au journal')

  await page.getByRole('link', { name: 'Voir le journal' }).click()
  await expect(page.getByRole('button', { name: /^Modifier Burger resto, 900 kcal/ })).toBeVisible()
  await expect(page.getByTestId('kcal-consumed')).toHaveText('900')
  expect(errors).toEqual([])
})

test('zone de collage sans presse-papiers : refus puis collage manuel', async ({ page, context }) => {
  const errors = await start(page, context)
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve(), readText: () => Promise.reject(new Error('NotAllowed')) },
    })
  })
  await openResponseScreen(page)
  await page.getByRole('button', { name: 'Coller depuis le presse-papiers' }).click()
  await expect(page.getByText('Lecture du presse-papiers refusée')).toBeVisible()
  await page.getByLabel('Réponse à analyser').fill('pas du json du tout')
  await page.getByRole('button', { name: 'Analyser' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(errors).toEqual([])
})

test('séance de Claude avec un nouvel exercice : aperçu plafonné, note, Commencer', async ({
  page,
  context,
}) => {
  const errors = await start(page, context)
  await openResponseScreen(page)
  const response = JSON.stringify([
    {
      type: 'sessionPlan',
      durationMin: 30,
      blocks: [
        { exerciseId: 'box-goblet-squat', sets: 3, reps: [8, 12], loadKg: 40, restSec: 90 },
        { exerciseId: 'incline-push-up', sets: 3, reps: [10, 15], restSec: 60 },
        { exerciseId: 'Hip thrust au sol KB', sets: 3, reps: [10, 15], restSec: 60 },
      ],
    },
    {
      type: 'exercise',
      name: 'Hip thrust au sol KB',
      pattern: 'hinge',
      level: 1,
      muscles: { primary: ['fessiers'], secondary: ['ischios'] },
      loadType: 'kettlebell',
      repRange: [10, 15],
      restSec: 75,
    },
  ])
  await pasteAndAnalyse(page, response)
  await expect(page.getByText('(nouvel exercice)')).toBeVisible()
  await expect(page.getByText('Charges plafonnées à ta progression')).toBeVisible()
  await page.getByRole('button', { name: 'Appliquer' }).click()
  await expect(page.getByRole('status')).toContainText('Séance proposée par Claude enregistrée')
  await expect(page.getByRole('status')).toContainText('1 exercice créé')

  await page.getByRole('link', { name: 'Voir la séance' }).click()
  await expect(page).toHaveURL(/\/seance\/apercu\?modele=claude-plan/)
  await expect(page.getByRole('heading', { name: 'Séance proposée par Claude' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Hip thrust au sol KB' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pompes inclinées' })).toBeVisible()
  await expect(page.getByText('Cibles de Claude ajustées')).toBeVisible()
  await expect(
    page.getByText('Goblet squat sur boîte : 24 kg demandé, 12 kg retenu (ta progression)'),
  ).toBeVisible()

  // La charge de 40 kg est d'abord ramenée à 24 kg (maximum de la kettlebell), puis à 12 kg (progression).
  // « Demander à Claude » depuis l'aperçu : la séance affichée et la liste des exercices accessibles.
  await page.getByRole('button', { name: 'Demander à Claude' }).click()
  const sheet = page.getByRole('dialog', { name: 'Demander à Claude' })
  await expect(sheet.getByLabel(/Message qui sera copié/)).toHaveValue(
    /Séance proposée \(avant de la faire\)/,
  )
  await expect(sheet.getByLabel(/Message qui sera copié/)).toHaveValue(/Exercices disponibles/)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Commencer la séance' }).click()
  await expect(page).toHaveURL(/\/seance\/en-cours/)
  expect(errors).toEqual([])
})

test('réponse sans bloc JSON : message clair, aucun aperçu', async ({ page, context }) => {
  const errors = await start(page, context)
  await openResponseScreen(page)
  await setClip(page, 'Bravo pour ta semaine, continue comme ça !')
  await page.getByRole('button', { name: 'Coller depuis le presse-papiers' }).click()
  await expect(page.getByText('Aucun JSON trouvé dans le texte.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Aperçu' })).toBeHidden()
  expect(errors).toEqual([])
})

test('élément invalide : non cochable, non appliqué ; rien à appliquer si tout est invalide', async ({
  page,
  context,
}) => {
  const errors = await start(page, context)
  await openResponseScreen(page)
  await pasteAndAnalyse(page, JSON.stringify([{ type: 'meal', name: 'Sans date', totals: { kcal: 'beaucoup' } }]))
  await expect(page.getByText('Élément 1 invalide')).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Appliquer' })).toBeDisabled()
  expect(errors).toEqual([])
})

test('séance dont le seul exercice (nouveau) est décoché : message « Séance non appliquée »', async ({
  page,
  context,
}) => {
  const errors = await start(page, context)
  await openResponseScreen(page)
  await pasteAndAnalyse(
    page,
    JSON.stringify([
      {
        type: 'sessionPlan',
        durationMin: 20,
        blocks: [{ exerciseId: 'Hip thrust au sol KB', sets: 3, reps: [10, 15], restSec: 60 }],
      },
      {
        type: 'exercise',
        name: 'Hip thrust au sol KB',
        pattern: 'hinge',
        level: 1,
        muscles: { primary: ['fessiers'], secondary: ['ischios'] },
        loadType: 'kettlebell',
        repRange: [10, 15],
        restSec: 75,
      },
    ]),
  )
  await page.getByRole('checkbox', { name: /Hip thrust au sol KB/ }).uncheck()
  await page.getByRole('button', { name: 'Appliquer' }).click()
  await expect(page.getByRole('status')).toContainText('Séance non appliquée : aucun exercice retenu.')
  expect(errors).toEqual([])
})

test('préférence : appliquée et visible sur la fiche de l’exercice', async ({ page, context }) => {
  const errors = await start(page, context)
  await openResponseScreen(page)
  await pasteAndAnalyse(
    page,
    JSON.stringify([
      { type: 'exercisePreference', exerciseId: 'goblet-squat', preference: 'disliked', reason: 'genoux' },
    ]),
  )
  await expect(page.getByText('Je n’aime pas')).toBeVisible()
  await page.getByRole('button', { name: 'Appliquer' }).click()
  await expect(page.getByRole('status')).toContainText('1 préférence enregistrée')
  await page.goto('./seance/exercices/goblet-squat')
  await expect(page.getByRole('radio', { name: 'Je n’aime pas' })).toBeChecked()
  expect(errors).toEqual([])
})

test('réglages : URL du coach enregistrée et utilisée, copie des instructions', async ({ page, context }) => {
  const errors = await start(page, context)
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Réglages' })
    .click()
  const field = page.getByLabel('Adresse du Projet Coach')
  await field.fill('http://exemple.com')
  await page.getByRole('button', { name: 'Enregistrer l’adresse' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'https://claude.ai/' })).toBeVisible()
  await field.fill('https://claude.ai/project/coach-123')
  await page.getByRole('button', { name: 'Enregistrer l’adresse' }).click()
  await expect(page.getByText('Adresse enregistrée.')).toBeVisible()

  await page.getByRole('button', { name: 'Copier les instructions du Projet Coach' }).click()
  await expect(page.getByText('Instructions copiées')).toBeVisible()
  expect(await clip(page)).toContain('Tu es mon coach sport et nutrition')
  await page.getByRole('button', { name: 'Voir les instructions' }).click()
  await expect(page.getByLabel('Instructions du Projet Coach')).toHaveValue(/Tu es mon coach/)
  await expect(page.getByRole('link', { name: 'Faire évoluer l’app' })).toHaveAttribute(
    'href',
    'https://claude.ai/code',
  )

  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Nutrition' })
    .click()
  await page.getByRole('button', { name: 'Demander à Claude' }).click()
  const popup = page.waitForEvent('popup')
  await page
    .getByRole('dialog', { name: 'Demander à Claude' })
    .getByRole('button', { name: 'Copier et ouvrir Claude' })
    .click()
  expect((await popup).url()).toBe('https://claude.ai/project/coach-123')
  expect(errors).toEqual([])
})

/** Écrit des lignes directement dans IndexedDB (la page est rechargée ensuite). */
async function inject(page: Page, rows: Record<string, unknown[]>): Promise<void> {
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('forge')
        open.onerror = () => reject(new Error('open'))
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction(Object.keys(data), 'readwrite')
          for (const [store, list] of Object.entries(data))
            for (const row of list) tx.objectStore(store).put(row)
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(new Error('write'))
        }
      }),
    rows,
  )
}

async function messageOf(page: Page): Promise<string> {
  const sheet = page.getByRole('dialog', { name: 'Demander à Claude' })
  const text = await sheet.getByLabel(/Message qui sera copié/).inputValue()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  return text
}

test('boutons de la fiche recette, du récapitulatif, du bilan et de la page Progrès', async ({
  page,
  context,
}) => {
  const errors = await start(page, context)

  // Fiche recette.
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Nutrition' })
    .click()
  await page
    .getByRole('navigation', { name: 'Recettes, frigo et courses' })
    .getByRole('link', { name: 'Recettes' })
    .click()
  await page.getByRole('link', { name: /Poulet, riz basmati et brocoli sauce soja/ }).click()
  await page.getByRole('button', { name: 'Demander à Claude' }).click()
  const recipe = await messageOf(page)
  expect(recipe).toContain('Écran : Fiche recette')
  expect(recipe).toContain('"parPortion"')

  // Séance terminée (injectée), semaine dernière et profil ancien pour la carte du lundi.
  const d = new Date()
  const monday = localDate(-((d.getDay() + 6) % 7) - 7)
  const [y, m, day] = monday.split('-').map(Number) as [number, number, number]
  const tue = new Date(y, m - 1, day + 1)
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${tue.getFullYear()}-${p(tue.getMonth() + 1)}-${p(tue.getDate())}`
  const profile = await page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        const open = indexedDB.open('forge')
        open.onsuccess = () => {
          const req = open.result.transaction('profile').objectStore('profile').getAll()
          req.onsuccess = () => {
            open.result.close()
            resolve(req.result[0] as Record<string, unknown>)
          }
        }
      }),
  )
  await inject(page, {
    sessions: [
      {
        id: 'e2e-claude-s1',
        date,
        durationMin: 30,
        status: 'done',
        warmup: [],
        blocks: [
          {
            id: 'b1',
            kind: 'single',
            exercises: [
              {
                exerciseId: 'goblet-squat',
                restSec: 60,
                sets: [1, 2, 3].map(() => ({ loadKg: 12, actualReps: 10, status: 'done' })),
              },
            ],
          },
        ],
        deload: false,
        estimatedMin: 30,
        updatedAt: new Date().toISOString(),
      },
    ],
    profile: [{ ...profile, createdAt: new Date(2026, 0, 1).toISOString() }],
  })
  await page.goto('./seance/recap/e2e-claude-s1')
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()
  await page.getByRole('button', { name: 'Demander à Claude' }).click()
  const after = await messageOf(page)
  expect(after).toContain('Écran : Séance terminée')
  expect(after).toContain('Goblet squat')

  // Page Progrès : bilan du lundi et page.
  await page.goto('./progres')
  await expect(page.getByRole('heading', { name: 'Progrès' })).toBeVisible()
  await settle(page)
  await page
    .getByLabel('Bilan de la semaine écoulée')
    .getByRole('button', { name: 'Demander à Claude' })
    .click()
  expect(await messageOf(page)).toContain('Écran : Bilan de la semaine')
  await page.getByRole('button', { name: 'Demander à Claude' }).last().click()
  const progress = await messageOf(page)
  expect(progress).toContain('Écran : Page Progrès')
  expect(errors).toEqual([])
})
