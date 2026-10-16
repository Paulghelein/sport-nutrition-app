import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding, localDate } from './helpers.ts'

// SHOTS_DIR : dossier où écrire des captures (usage manuel, ignoré sinon).
const shots = process.env['SHOTS_DIR']

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

function squatSession(id: string, date: string, loadKg: number) {
  return {
    id,
    date,
    durationMin: 30,
    status: 'done',
    warmup: [],
    blocks: [
      {
        kind: 'single',
        exercises: [
          {
            exerciseId: 'goblet-squat',
            restSec: 60,
            sets: [1, 2, 3].map(() => ({ loadKg, actualReps: 10, status: 'done' })),
          },
        ],
      },
    ],
    deload: false,
    estimatedMin: 30,
    updatedAt: new Date().toISOString(),
  }
}

/** Une séance il y a 10 jours (référence) et une aujourd'hui, plus lourde (record), et un repas aujourd'hui. */
async function seed(page: Page): Promise<void> {
  await inject(page, {
    sessions: [squatSession('cal-s0', localDate(-10), 10), squatSession('cal-s1', localDate(0), 14)],
    foodLog: [
      {
        id: 'cal-f1',
        date: localDate(0),
        slot: 'lunch',
        name: 'Riz au poulet',
        origin: { kind: 'free' },
        macros: { kcal: 800, protein: 50, carbs: 100, fat: 20 },
        createdAt: new Date().toISOString(),
      },
    ],
  })
  await page.reload()
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' })

test('Progrès : trois chiffres, calendrier de 12 semaines, toucher un jour ouvre son résumé', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await seed(page)
  await nav(page).getByRole('link', { name: 'Progrès' }).click()

  // Les trois chiffres de tête.
  const card = page.getByRole('region', { name: 'Régularité' })
  await expect(card.getByText('Série', { exact: true })).toBeVisible()
  await expect(card.getByText('Ce mois', { exact: true })).toBeVisible()
  await expect(card.getByText('Nutrition', { exact: true })).toBeVisible()
  await expect(card).toContainText(/% des jours/)

  // 84 cases-boutons, légende, une seule case dans l'ordre de tabulation.
  const cells = page.getByTestId('calendar-day')
  await expect(cells).toHaveCount(84)
  await expect(card.getByText('Nutrition OK')).toBeVisible()
  await expect(page.locator('[data-testid="calendar-day"][tabindex="0"]')).toHaveCount(1)

  // La case d'aujourd'hui : séance avec record, nutrition évaluée (libellé complet en français).
  const today = page.locator(`[data-testid="calendar-day"][data-date="${localDate(0)}"]`)
  await expect(today).toHaveAttribute(
    'aria-label',
    /\(aujourd’hui\) : séance de 30 min \(record battu\), nutrition/,
  )
  await expect(today).toHaveAttribute('data-level', '4')
  const earlier = page.locator(`[data-testid="calendar-day"][data-date="${localDate(-10)}"]`)
  await expect(earlier).toHaveAttribute('aria-label', /séance de 30 min, nutrition non évaluée/)
  await expect(earlier).toHaveAttribute('data-level', '2')
  if (shots) await page.screenshot({ path: `${shots}/progres-top.png` })

  // Toucher aujourd'hui : séance, record, repas, total.
  await today.scrollIntoViewIfNeeded()
  await today.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Aujourd’hui', { exact: true })).toBeVisible()
  await expect(sheet.getByText('Séance de 30 min')).toBeVisible()
  await expect(sheet.getByText('3 séries · Goblet squat')).toBeVisible()
  await expect(sheet.getByText('Record : Goblet squat, 14 kg')).toBeVisible()
  await expect(sheet.getByText('Déjeuner')).toBeVisible()
  await expect(sheet.getByText('Riz au poulet')).toBeVisible()
  await expect(sheet.getByText('Total du jour')).toBeVisible()
  await expect(sheet.getByTestId('day-nutrition-status')).toBeVisible()
  if (shots) await page.screenshot({ path: `${shots}/progres-jour.png` })
  // Journée en cours : pas jugée.
  await expect(sheet.getByTestId('day-nutrition-status')).toContainText('Journée en cours')
  // Jour précédent / suivant : on ne va pas dans le futur.
  await expect(sheet.getByRole('button', { name: 'Jour suivant' })).toBeDisabled()
  await sheet.getByRole('button', { name: 'Jour précédent' }).click()
  await expect(sheet.getByText('Aujourd’hui', { exact: true })).toBeHidden()
  await expect(sheet.getByRole('button', { name: 'Jour suivant' })).toBeEnabled()
  await expect(page.locator('[data-testid="calendar-day"][aria-current="date"]')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  // Un jour sans rien : message vide.
  await page.locator(`[data-testid="calendar-day"][data-date="${localDate(-3)}"]`).click()
  await expect(sheet.getByText(/Rien d’enregistré/)).toBeVisible()
  await sheet.getByRole('button', { name: 'Fermer' }).click()
  await expect(sheet).toBeHidden()

  // Un jour à venir (s'il y en a dans la semaine en cours).
  const future = page.locator('[data-testid="calendar-day"][data-level="future"]').first()
  if ((await future.count()) > 0) {
    await future.click()
    await expect(sheet.getByText('Ce jour n’est pas encore arrivé.')).toBeVisible()
    await page.keyboard.press('Escape')
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
})

test('Progrès : records récents, courbe de poids (carte), ordre des sections', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await seed(page)
  await nav(page).getByRole('link', { name: 'Progrès' }).click()

  const records = page.getByRole('region', { name: 'Records récents' })
  await expect(records).toContainText('Goblet squat')
  await expect(records).toContainText('Charge max · aujourd’hui')
  await expect(records).toContainText('14 kg')

  // Poids : moyenne 7 j de la pesée d'onboarding, pas de courbe avec une seule pesée.
  const weight = page.getByRole('region', { name: 'Poids', exact: true })
  await expect(weight).toContainText('Poids · moyenne 7 j')
  await expect(weight).toContainText('72,5')
  await expect(weight).toContainText('La courbe apparaît dès deux pesées')

  // Deux pesées dans la fenêtre : la courbe (Recharts, à la demande) apparaît avec sa description.
  await page.getByRole('button', { name: 'Ajouter une pesée' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter une pesée' })
  await dialog.getByLabel('Poids').fill('71,0')
  await dialog.getByLabel('Date').fill(localDate(-20))
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()
  await expect(
    weight.getByRole('img', { name: /Courbe de la moyenne 7 jours de 71,0 à 72,5 kg/ }),
  ).toBeVisible()
  await expect(weight).toContainText('en 3 sem.')

  // Ordre : régularité, poids, records juste dessous, puis le détail ; l'historique des pesées est tout en bas.
  const order = await page.locator('main h2').evaluateAll((hs) => hs.map((h) => h.textContent ?? ''))
  const names = [
    'Régularité',
    'Poids',
    'Records récents',
    'Force',
    'Niveau par mouvement',
    'Volume',
    'Nutrition',
    'Historique des pesées',
    'Mensurations',
  ]
  const idx = names.map((n) => order.findIndex((x) => x.startsWith(n)))
  expect(idx.every((i) => i >= 0)).toBe(true)
  expect([...idx].sort((x, y) => x - y)).toEqual(idx)
  expect(idx[2]).toBe((idx[1] ?? 0) + 1)
  // Les pesées ne sont pas dans la carte Poids.
  await expect(weight.getByRole('button', { name: /^Modifier la pesée/ })).toHaveCount(0)
  if (shots) await page.screenshot({ path: `${shots}/progres-poids.png`, fullPage: false })
  expect(errors).toEqual([])
})

test('Aujourd’hui : « Ta semaine » interactive, un jour ouvre son résumé (cibles ≥ 44 px)', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await seed(page)

  const week = page.getByRole('region', { name: 'Ta semaine' })
  const days = week.getByTestId('week-day')
  await expect(days).toHaveCount(7)
  for (const box of await days.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))) {
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
  }

  const today = week.getByRole('button', { name: /\(aujourd’hui\) : séance de 30 min \(record battu\)/ })
  await expect(today).toBeVisible()
  if (shots) await page.screenshot({ path: `${shots}/aujourdhui.png` })
  await today.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Séance de 30 min')).toBeVisible()
  await expect(sheet.getByText('Record : Goblet squat, 14 kg')).toBeVisible()
  await expect(sheet.getByText('Riz au poulet')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  expect(errors).toEqual([])
})
