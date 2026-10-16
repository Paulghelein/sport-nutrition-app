import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding } from './helpers.ts'

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

interface RawSet {
  setType?: string
  targetDurationSec?: number
  actualReps?: number
  status?: string
}
async function readSessions(
  page: Page,
): Promise<{ blocks: { exercises: { exerciseId: string; sets: RawSet[] }[] }[] }[]> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('forge')
        open.onerror = () => reject(new Error('open'))
        open.onsuccess = () => {
          const req = open.result.transaction('sessions').objectStore('sessions').getAll()
          req.onsuccess = () => {
            open.result.close()
            resolve(req.result)
          }
        }
      }),
  )
}

const now = new Date().toISOString()
const state = (exerciseId: string, loadKg: number | null) => ({
  exerciseId,
  loadKg,
  recentFeelings: ['ok', 'easy'],
  updatedAt: now,
})

async function boot(page: Page, pushId = 'incline-push-up') {
  await page.clock.install()
  await page.goto('./')
  await completeOnboarding(page)
  await inject(page, {
    // Deux séances déjà faites (ressentis) : la série max est admissible (règles de setTypes.ts).
    exerciseState: [state(pushId, null), state('two-hand-swing', 12)],
    sessionTemplates: [
      {
        id: 'tpl-max',
        name: 'Séance max',
        durationMin: 30,
        createdAt: now,
        updatedAt: now,
        blocks: [
          {
            group: 1,
            kind: 'single',
            exerciseId: pushId,
            sets: 3,
            reps: [8, 12],
            restSec: 60,
            lastSetAmrap: true,
          },
          {
            group: 2,
            kind: 'finisher',
            exerciseId: 'two-hand-swing',
            sets: 2,
            durationSec: 30,
            setType: 'timedMax',
            restSec: 45,
          },
        ],
      },
    ],
  })
  await page.goto('./entrainement/apercu?modele=tpl-max')
}

test('séance avec série max (AMRAP) puis finisher en temps fixe, de bout en bout', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  await boot(page)

  // Aperçu : prescription lisible.
  await expect(page.getByText('dernière série : max')).toBeVisible()
  await expect(page.getByText('2 × max en 30 s')).toBeVisible()
  await expect(page.getByText('Finisher', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Démarrer', exact: true }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()

  const skipRest = () => page.getByRole('button', { name: /Passer le repos|Série suivante/ }).click()
  // Séries 1 et 2 : normales (pas de consigne d'arrêt).
  for (let i = 0; i < 2; i++) {
    await expect(page.getByRole('group', { name: 'Répétitions', exact: true })).toBeVisible()
    await expect(page.getByText('Arrête-toi dès que la forme se dégrade')).toHaveCount(0)
    await page.getByRole('button', { name: 'Correct', exact: true }).click()
    await skipRest()
  }

  // Série 3 : max, consigne d'arrêt visible, saisie sans cible.
  await expect(page.getByText('Arrête-toi dès que la forme se dégrade ; descends contrôlé.')).toBeVisible()
  const max = page.getByRole('group', { name: 'Maximum de répétitions' })
  await expect(max).toBeVisible()
  // Cibles de séance : ± et boutons de ressenti d'au moins 64 px.
  for (const b of [
    max.getByRole('button', { name: 'Une répétition de plus' }),
    max.getByRole('button', { name: 'Une répétition de moins' }),
    page.getByRole('button', { name: 'Correct', exact: true }),
  ]) {
    const box = await b.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(63.5)
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(63.5)
  }
  const before = Number((await max.locator('output').innerText()).trim())
  for (let i = 0; i < 3; i++) await max.getByRole('button', { name: 'Une répétition de plus' }).click()
  await expect(max.locator('output')).toHaveText(String(before + 3))
  await page.getByRole('button', { name: 'Correct', exact: true }).click()
  await skipRest()

  // Finisher en temps fixe : compte à rebours lancé par un tap, puis saisie des reps.
  await expect(page.getByText('Finisher', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Correct', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Lancer les 30 s' }).click()
  await expect(page.getByRole('group', { name: 'Compte à rebours de la série' })).toBeVisible()
  await page.clock.fastForward(31_000)
  const reps = page.getByRole('group', { name: 'Répétitions', exact: true })
  await expect(reps).toBeVisible()
  for (let i = 0; i < 4; i++) await reps.getByRole('button', { name: 'Une répétition de plus' }).click()
  const typed = Number((await reps.locator('output').innerText()).trim().split(/\s/)[0])
  await page.getByRole('button', { name: 'Correct', exact: true }).click()
  await skipRest()
  // Deuxième série : saisie sans chrono.
  await page.getByRole('button', { name: 'Saisir sans chrono' }).click()
  await page.getByRole('button', { name: 'Dur', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Bravo, c’est fini !' })).toBeVisible()
  const [session] = await readSessions(page)
  const push = session?.blocks[0]?.exercises[0]?.sets ?? []
  expect(push.map((s) => s.setType ?? 'reps')).toEqual(['reps', 'reps', 'amrap'])
  expect(push[2]?.actualReps).toBe(before + 3)
  const swing = session?.blocks[1]?.exercises[0]?.sets ?? []
  expect(
    swing.every((s) => s.setType === 'timedMax' && s.targetDurationSec === 30 && s.status === 'done'),
  ).toBe(true)
  expect(swing[0]?.actualReps).toBe(typed)

  await page.getByRole('button', { name: 'Terminer la séance' }).click()
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()
  expect(errors).toEqual([])
})

test('aperçu : remplacer un exercice à série max retire « dernière série : max »', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page, 'push-up')
  await expect(page.getByText('dernière série : max')).toBeVisible()
  const picker = page.getByRole('dialog', { name: /Remplacer l’exercice/ })
  await page.getByRole('button', { name: 'Remplacer Pompes' }).click()
  await expect(picker).toBeVisible()
  const choices = picker.locator('li button')
  // Selon le niveau et le matériel, l'exercice à série max peut n'avoir aucun remplaçant : on le signale.
  test.skip((await choices.count()) === 0, 'aucun remplaçant pour l’exercice à série max')
  await choices.first().click()
  await expect(picker).toHaveCount(0)
  await expect(page.getByText('dernière série : max')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('formulaire d’exercice : case série max seulement poids du corps en répétitions, conservée', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('./entrainement/exercices/push-up/modifier')
  await completeOnboarding(page)
  await page.goto('./entrainement/exercices/push-up/modifier')
  const box = page.getByLabel('Peut finir par une série max')
  await expect(box).toBeVisible()
  await expect(box).toBeChecked()
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
  await expect(page).toHaveURL(/\/entrainement\/exercices\/push-up$/)
  await page.goto('./entrainement/exercices/push-up/modifier')
  await expect(page.getByLabel('Peut finir par une série max')).toBeChecked()
  // Un exercice à la kettlebell n'a pas la case.
  await page.goto('./entrainement/exercices/two-hand-swing/modifier')
  await expect(page.getByLabel('Nom', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Peut finir par une série max')).toHaveCount(0)
  expect(errors).toEqual([])
})
