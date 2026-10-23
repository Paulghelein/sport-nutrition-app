import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding, localDate } from './helpers.ts'

/** Lundi de la semaine écoulée (dates locales). */
function previousMonday(): string {
  const d = new Date()
  const offset = (d.getDay() + 6) % 7 // 0 = lundi
  return localDate(-offset - 7)
}

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

async function readProfile(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const open = indexedDB.open('forge')
        open.onerror = () => reject(new Error('open'))
        open.onsuccess = () => {
          const req = open.result.transaction('profile').objectStore('profile').getAll()
          req.onsuccess = () => {
            open.result.close()
            resolve(req.result[0] as Record<string, unknown>)
          }
        }
      }),
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

test('Progrès : carte du lundi, rappel de sauvegarde, données, mensurations', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)

  const monday = previousMonday()
  const next = (n: number) => {
    const [y, m, d] = monday.split('-').map(Number) as [number, number, number]
    const t = new Date(y, m - 1, d + n)
    const p = (x: number) => String(x).padStart(2, '0')
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
  }
  await inject(page, {
    sessions: [
      squatSession('e2e-s0', next(-6), 10),
      squatSession('e2e-s1', next(1), 12),
      squatSession('e2e-s2', next(3), 14),
    ],
    // Profil plus ancien que la semaine évaluée : la carte du lundi s'affiche.
    profile: [{ ...(await readProfile(page)), createdAt: new Date(2026, 0, 1).toISOString() }],
    foodLog: [
      {
        id: 'e2e-f1',
        date: next(2),
        slot: 'lunch',
        name: 'Riz',
        origin: { kind: 'free' },
        macros: { kcal: 2800, protein: 120, carbs: 300, fat: 80 },
        createdAt: new Date().toISOString(),
      },
    ],
  })
  await page.reload()
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Progrès' })
    .click()

  // Ordre des cartes : Régularité (3 chiffres + calendrier), bilan du lundi, rappel de sauvegarde, Poids.
  const cards = [
    page.locator('section[aria-label="Régularité"]'),
    page.locator('section[aria-label="Bilan de la semaine"]'),
    page.getByLabel('Rappel de sauvegarde'),
    page.locator('section[aria-label="Poids"]'),
  ]
  for (const c of cards) await expect(c).toBeVisible()
  for (let i = 0; i < cards.length - 1; i++) {
    const next = await cards[i + 1]?.elementHandle()
    const before = await cards[i]?.evaluate(
      (el, other) =>
        other !== null && (el.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      next ?? null,
    )
    expect(before, `la carte ${i + 1} précède la carte ${i + 2}`).toBe(true)
  }

  // Carte du lundi
  const review = page.getByRole('heading', { name: 'Bilan de la semaine' })
  await expect(review).toBeVisible()
  const card = page.getByLabel('Bilan de la semaine écoulée')
  await expect(card).toContainText('2 / 5')
  await expect(card).toContainText('60 min')
  await expect(card).toContainText('Goblet squat')

  // Rappel de sauvegarde (jamais exportée)
  const banner = page.getByLabel('Rappel de sauvegarde')
  await expect(banner).toContainText('jamais')
  await banner.getByRole('link', { name: /réglages/i }).click()
  await expect(page).toHaveURL(/\/reglages#sauvegarde$/)
  await expect(page.getByRole('heading', { name: 'Sauvegarde', level: 2 })).toBeInViewport()
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Progrès' })
    .click()

  // Régularité, force, volume, nutrition
  await expect(page.getByRole('heading', { name: 'Régularité (12 semaines)' })).toBeVisible()
  await page.getByRole('button', { name: /Goblet squat/ }).click()
  await expect(page.getByText('Charge la plus lourde')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Niveau par mouvement' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Volume des 7 derniers jours' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nutrition de la semaine' })).toBeVisible()

  // Fermer la carte : elle ne revient pas après rechargement
  await card.getByRole('button', { name: 'Fermer' }).click()
  await expect(review).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Régularité (12 semaines)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bilan de la semaine' })).toBeHidden()
  await expect(page.getByLabel('Rappel de sauvegarde')).toBeVisible()

  // Mensurations : ajout, modification, suppression
  const rows = page.getByRole('button', { name: /^Modifier la mensuration/ })
  await expect(rows).toHaveCount(0)
  await page.locator('main').getByRole('button', { name: 'Ajouter', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Ajouter une mensuration' })
  await sheet.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(sheet.getByRole('alert')).toContainText('au moins une mensuration')
  await sheet.getByLabel('Bras').fill('34,5')
  await sheet.getByLabel('Taille').fill('80')
  await sheet.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(sheet).toBeHidden()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Bras 34,5 cm')

  await rows.first().click()
  const edit = page.getByRole('dialog', { name: 'Modifier la mensuration' })
  await edit.getByLabel('Taille').fill('')
  await edit.getByLabel('Poitrine').fill('101')
  await edit.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(edit).toBeHidden()
  await expect(rows.first()).toContainText('Poitrine 101 cm')
  await expect(rows.first()).not.toContainText('Taille')

  await rows.first().click()
  await edit.getByRole('button', { name: 'Supprimer' }).click()
  const confirm = page.getByRole('dialog', { name: 'Supprimer cette mensuration ?' })
  await confirm.getByRole('button', { name: 'Annuler' }).click()
  await expect(rows).toHaveCount(1)
  await edit.getByRole('button', { name: 'Supprimer' }).click()
  await confirm.getByRole('button', { name: 'Supprimer' }).click()
  await expect(rows).toHaveCount(0)

  expect(errors).toEqual([])
})

test('Progrès : sans donnée, états vides et pas d’erreur', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Progrès' })
    .click()
  // Profil créé aujourd'hui : rien à évaluer, pas de carte du lundi.
  await expect(page.getByRole('heading', { name: 'Bilan de la semaine' })).toBeHidden()
  await expect(page.getByText('Pas de séance pour l’instant')).toBeVisible()
  await expect(page.getByText('Pas encore de séance terminée')).toBeVisible()
  await expect(page.getByText('Rien de logué cette semaine')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
})
