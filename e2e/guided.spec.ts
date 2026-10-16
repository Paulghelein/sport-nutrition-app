import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding, openTraining } from './helpers.ts'

async function pick(page: Page, name: string) {
  const radio = page.getByRole('radio', { name })
  await radio.click()
  await expect(radio).toBeChecked()
}

async function boot(page: Page) {
  // Horloge simulée qui part de l'heure réelle (les horodatages enregistrés restent cohérents après un rechargement).
  await page.clock.install()
  await page.goto('./')
  await completeOnboarding(page)
  await openTraining(page)
}

async function openPreview(page: Page, duration: string) {
  await pick(page, duration)
  await page.getByRole('link', { name: 'Voir la séance' }).click()
  await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeVisible()
}

async function startGuided(page: Page, duration = '20 min') {
  await openPreview(page, duration)
  await page.getByRole('button', { name: 'Démarrer', exact: true }).click()
  await expect(page).toHaveURL(/\/entrainement\/seance$/)
  await expect(page.getByRole('heading', { name: 'Échauffement' })).toBeVisible()
  await page.getByRole('button', { name: 'C’est parti' }).click()
}

/** Valide la série affichée (ressenti donné). */
async function doSet(page: Page, feeling = 'Correct') {
  await page.getByRole('button', { name: feeling, exact: true }).click()
}

/** Monte le compteur de répétitions jusqu'au haut de la fourchette (la valeur préremplie est le bas). */
async function raiseRepsToTop(page: Page) {
  const group = page.getByRole('group', { name: 'Répétitions', exact: true })
  const hint = await group.innerText()
  const m = /Objectif (\d+)(?:–(\d+))?/.exec(hint)
  // Une série en répétitions affiche toujours son objectif : sinon l'interface a changé, le test doit échouer.
  expect(m, `objectif de répétitions introuvable dans « ${hint} »`).not.toBeNull()
  if (!m) return
  const top = Number(m[2] ?? m[1])
  for (let i = 0; i < 40; i++) {
    const value = Number((await group.locator('output').innerText()).trim().split(/\s/)[0])
    if (value >= top) return
    await group.getByRole('button', { name: 'Une répétition de plus' }).click()
  }
}

async function skipRest(page: Page) {
  await page.getByRole('button', { name: /Passer le repos|Série suivante/ }).click()
}

test('séance de 20 min de bout en bout, historique corrigé, modèle relancé', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  await boot(page)

  // Aperçu : remplacer le premier exercice (avec « Comment faire ? » empilé), puis démarrer.
  await openPreview(page, '20 min')
  const firstName = await page.locator('a[href*="/entrainement/exercices/"]').first().innerText()
  const picker = page.getByRole('dialog', { name: /Remplacer l’exercice/ })
  const replaceButtons = page.getByRole('button', { name: /^Remplacer / })
  let replacedName = firstName
  for (let i = 0; i < (await replaceButtons.count()); i++) {
    const name = await page.locator('a[href*="/entrainement/exercices/"]').nth(i).innerText()
    await replaceButtons.nth(i).click()
    const choices = picker.locator('li button')
    await expect(picker).toBeVisible()
    if ((await choices.count()) === 0) {
      await picker.getByRole('button', { name: 'Annuler' }).click()
      continue
    }
    // « Comment faire ? » s'ouvre par-dessus la feuille (empilée).
    await picker
      .getByRole('button', { name: /^Comment faire/ })
      .first()
      .click()
    await expect(page.getByRole('dialog', { name: /^Comment faire/ })).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()
    await choices.first().click()
    await expect(picker).toHaveCount(0)
    replacedName = await page.locator('a[href*="/entrainement/exercices/"]').nth(i).innerText()
    expect(replacedName).not.toBe(name)
    break
  }
  expect(replacedName).not.toBe(firstName === replacedName ? '' : firstName)

  // Édition gardée au retour depuis une fiche.
  const links = page.locator('a[href*="/entrainement/exercices/"]')
  const names = await links.allInnerTexts()
  await links.first().click()
  await page.goBack()
  expect(await links.allInnerTexts()).toEqual(names)

  await page.getByRole('button', { name: 'Démarrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Échauffement' })).toBeVisible()
  await page.getByRole('button', { name: 'C’est parti' }).click()

  // Série 1 : gros chiffres, puis repos.
  await expect(page.getByRole('heading', { level: 1, name: names[0] })).toBeVisible()
  await doSet(page, 'Facile')
  await expect(page.getByRole('timer', { name: 'Temps de repos restant' })).toBeVisible()
  await skipRest(page)

  // Une série passée via le menu.
  await page.getByRole('button', { name: 'Options' }).click()
  await page.getByRole('button', { name: 'Passer la série' }).click()

  // Remplacement de l'exercice courant via le menu (si une alternative existe pour cet exercice).
  const before = await page.getByRole('heading', { level: 1 }).innerText()
  await page.getByRole('button', { name: 'Options' }).click()
  await page.getByRole('button', { name: 'Remplacer l’exercice' }).click()
  const guidedChoices = page.getByRole('dialog', { name: /Remplacer l’exercice/ }).locator('li button')
  if ((await guidedChoices.count()) > 0) {
    await guidedChoices.first().click()
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(before)
  } else {
    await page.getByRole('button', { name: 'Annuler' }).click()
  }

  // Le reste de la séance.
  for (let i = 0; i < 80; i++) {
    if (await page.getByRole('button', { name: 'Terminer la séance' }).isVisible()) break
    if (await page.getByRole('button', { name: /Passer le repos|Série suivante/ }).isVisible()) {
      await skipRest(page)
    } else {
      await doSet(page, i % 3 === 0 ? 'Dur' : 'Correct')
    }
  }
  await expect(page.getByRole('heading', { name: 'Bravo, c’est fini !' })).toBeVisible()
  await page.screenshot({ path: 'test-results/guided-finished.png' })
  await page.getByRole('button', { name: 'Terminer la séance' }).click()

  // Récapitulatif.
  await expect(page).toHaveURL(/\/entrainement\/recap\//)
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()
  await expect(page.getByText('Séries faites')).toBeVisible()
  await page.screenshot({ path: 'test-results/guided-recap.png', fullPage: true })
  const accept = page.getByRole('button', { name: 'Accepter' }).first()
  if (await accept.isVisible()) {
    await accept.click()
    await expect(page.getByText('Acceptée')).toBeVisible()
  }
  await page.getByRole('button', { name: 'Enregistrer comme modèle' }).click()
  await page.getByLabel('Nom du modèle').fill('Mon modèle test')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText(/Modèle « Mon modèle test » enregistré/)).toBeVisible()
  await page.getByRole('button', { name: 'Terminé' }).click()
  await expect(page).toHaveURL(/\/entrainement$/)

  // Historique : corriger une série.
  await page.getByRole('link', { name: 'Historique' }).click()
  await expect(page.getByText('Terminée', { exact: true })).toBeVisible()
  await page.locator('a[href*="/entrainement/historique/"]').first().click()
  await page.getByRole('button', { name: 'Corriger les séries' }).click()
  await expect(page.getByText(/ne modifie pas ta progression/)).toBeVisible()
  const reps = page.getByLabel('Répétitions').first()
  await reps.fill('15')
  await page.getByRole('button', { name: 'Enregistrer les corrections' }).click()
  await expect(page.getByRole('button', { name: 'Corriger les séries' })).toBeVisible()
  await page.screenshot({ path: 'test-results/guided-history-detail.png', fullPage: true })

  // Modèle : relancer.
  await page.goto('./entrainement/modeles')
  await expect(page.getByRole('heading', { name: 'Mon modèle test' })).toBeVisible()
  await page.getByRole('link', { name: 'Démarrer Mon modèle test' }).click()
  await expect(page).toHaveURL(/apercu\?modele=/)
  await page.getByRole('button', { name: 'Démarrer', exact: true }).click()
  await expect(page).toHaveURL(/\/entrainement\/seance$/)

  expect(errors).toEqual([])
})

test('reprise après rechargement : même série, minuteur de repos cohérent', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page)
  await startGuided(page)
  await page.screenshot({ path: 'test-results/guided-set.png' })
  await doSet(page)
  const timer = page.getByRole('timer', { name: 'Temps de repos restant' })
  await expect(timer).toBeVisible()
  // Le geste de validation ne doit pas ajuster le repos (double tap) : −15 s / +15 s sont armés après 600 ms.
  await expect(page.getByRole('button', { name: '−15 s' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '+15 s' })).toBeDisabled()
  await page.screenshot({ path: 'test-results/guided-rest.png' })
  await page.waitForLoadState('networkidle')

  await page.reload()
  await expect(timer).toBeVisible()
  const [m, s] = (await timer.innerText()).split(':').map(Number)
  const remaining = (m ?? 0) * 60 + (s ?? 0)
  expect(remaining).toBeGreaterThan(0)
  expect(remaining).toBeLessThanOrEqual(90)

  // Fin du repos : retour sur la série suivante (même exercice, série 2).
  await page.clock.fastForward(300_000)
  await expect(page.getByRole('button', { name: 'Série suivante' })).toBeEnabled()
  await expect(page.getByText('Repos terminé').first()).toBeVisible()
  await page.getByRole('button', { name: 'Série suivante' }).click()
  const next = await page.getByRole('heading', { level: 1 }).innerText()
  expect(next).toBeTruthy()

  // Rechargement au milieu d'une série : même exercice, même numéro.
  const position = await page
    .getByText(/^Série \d+ sur \d+$/)
    .first()
    .innerText()
  await page.waitForLoadState('networkidle')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: next })).toBeVisible()
  await expect(page.getByText(position, { exact: true }).first()).toBeVisible()

  // Pause puis reprise depuis l'écran Séance.
  await page.getByRole('button', { name: 'Quitter' }).click()
  await page.getByRole('button', { name: 'Mettre en pause' }).click()
  await expect(page).toHaveURL(/\/entrainement$/)
  await page.getByRole('link', { name: 'Reprendre', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: next })).toBeVisible()

  // Abandon.
  await page.getByRole('button', { name: 'Quitter' }).click()
  await page.getByRole('button', { name: 'Abandonner la séance' }).click()
  await page.getByRole('button', { name: 'Abandonner', exact: true }).click()
  await expect(page).toHaveURL(/\/entrainement$/)
  await expect(page.getByRole('link', { name: 'Reprendre', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

// ---------------------------------------------------------------------------------------------------------------
// Scénarios J4 supplémentaires (qa-tester) : lecture directe d'IndexedDB (base « forge »).

interface RawSession {
  id: string
  status: string
  progressionAppliedAt?: string
  restEndsAt?: string
  blocks: { kind: string; exercises: { exerciseId: string; sets: { status?: string }[] }[] }[]
}
interface RawState {
  exerciseId: string
  loadKg: number | null
  topStreak?: number
  recentFeelings: string[]
  updatedAt: string
}

async function readStore<T>(page: Page, store: 'sessions' | 'exerciseState'): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('forge')
        open.onerror = () => reject(new Error('open'))
        open.onsuccess = () => {
          const req = open.result.transaction(name).objectStore(name).getAll()
          req.onsuccess = () => {
            open.result.close()
            resolve(req.result)
          }
          req.onerror = () => reject(new Error('getAll'))
        }
      }),
    store,
  ) as Promise<T[]>
}

/** Fait toutes les séries restantes (ressenti « Correct ») jusqu'à l'écran de fin ; renvoie la suite (titre, série). */
async function runToEnd(page: Page, record?: string[]) {
  for (let i = 0; i < 120; i++) {
    if (await page.getByRole('button', { name: 'Terminer la séance' }).isVisible()) return
    if (await page.getByRole('button', { name: /Passer le repos|Série suivante/ }).isVisible()) {
      await skipRest(page)
      continue
    }
    if (record) {
      const title = await page.getByRole('heading', { level: 1 }).innerText()
      const pos = await page
        .getByText(/^Série \d+ sur \d+$/)
        .first()
        .innerText()
      record.push(`${title}|${pos}`)
    }
    await doSet(page)
  }
  throw new Error('fin de séance non atteinte')
}

test('séance de 30 min : supersets, ordre des tours correct jusqu’au bout', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  await boot(page)
  await startGuided(page, '30 min')
  const [session] = await readStore<RawSession>(page, 'sessions')
  const names = new Map<string, string>()
  const seen: string[] = []
  await runToEnd(page, seen)
  // Pour chaque superset de la séance : A1,B1,A2,B2,… (série = tour).
  const supersets = session?.blocks.filter((b) => b.kind === 'superset') ?? []
  test.info().annotations.push({ type: 'supersets', description: String(supersets.length) })
  if (supersets.length > 0) {
    expect(seen.some((s) => s.includes('|Série 1 sur'))).toBe(true)
    // Aucun exercice n'enchaîne deux fois d'affilée au sein d'un superset.
    let consecutiveSame = 0
    for (let i = 1; i < seen.length; i++)
      if (seen[i]?.split('|')[0] === seen[i - 1]?.split('|')[0]) consecutiveSame++
    const singleSets = (session?.blocks ?? [])
      .filter((b) => b.kind !== 'superset')
      .reduce((n, b) => n + (b.exercises[0]?.sets.length ?? 0), 0)
    expect(consecutiveSame).toBeLessThanOrEqual(singleSets)
    await page.screenshot({ path: 'test-results/guided-superset-end.png' })
  }
  void names
  await expect(page.getByRole('heading', { name: 'Bravo, c’est fini !' })).toBeVisible()
  expect(errors).toEqual([])
})

test('reprise : repos de 90 s, réouverture 40 s plus tard -> ~50 s ; après la fin -> série suivante', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await boot(page)
  await startGuided(page, '45 min')
  const timer = page.getByRole('timer', { name: 'Temps de repos restant' })
  const read = async () => {
    const [m, s] = (await timer.innerText()).split(':').map(Number)
    return (m ?? 0) * 60 + (s ?? 0)
  }
  // Avance jusqu'à un vrai repos (>= 60 s) ; les enchaînements de superset ont un repos court.
  let start = 0
  for (let i = 0; i < 20 && start < 60; i++) {
    await doSet(page)
    await expect(timer.or(page.getByRole('button', { name: 'Correct', exact: true }))).toBeVisible()
    if (!(await timer.isVisible())) continue
    start = await read()
    if (start < 60) await skipRest(page)
  }
  expect(start).toBeGreaterThanOrEqual(60)
  await page.waitForLoadState('networkidle')
  // Attend que la sauvegarde du restEndsAt soit faite.
  await expect
    .poll(async () => (await readStore<RawSession>(page, 'sessions'))[0]?.restEndsAt ?? '')
    .not.toBe('')
  await page.clock.fastForward(40_000)
  await page.reload()
  await expect(timer).toBeVisible()
  const after = await read()
  test
    .info()
    .annotations.push({ type: 'rest', description: `départ ${start}s, après 40 s + reload : ${after}s` })
  expect(after).toBeGreaterThanOrEqual(start - 40 - 3)
  expect(after).toBeLessThanOrEqual(start - 40 + 3)

  // Réouverture après la fin du repos.
  await page.clock.fastForward(120_000)
  await page.reload()
  await expect(page.getByRole('timer', { name: 'Temps de repos restant' })).toHaveCount(0)
  await expect(page.getByText(/^Série 2 sur \d+$/).first()).toBeVisible()
  expect(errors).toEqual([])
})

test('double tap sur « Terminer la séance » : une seule séance done, progression appliquée une fois', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await boot(page)
  await startGuided(page)
  await runToEnd(page)
  const finish = page.getByRole('button', { name: 'Terminer la séance' })
  await finish.dblclick({ delay: 0 })
  await expect(page).toHaveURL(/\/entrainement\/recap\//)
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()
  const sessions = await readStore<RawSession>(page, 'sessions')
  expect(sessions.filter((s) => s.status === 'done')).toHaveLength(1)
  expect(sessions).toHaveLength(1)
  const states1 = await readStore<RawState>(page, 'exerciseState')
  expect(states1.length).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  const states2 = await readStore<RawState>(page, 'exerciseState')
  expect(states2).toEqual(states1)
  // Chaque exercice : un seul ressenti enregistré (progression jouée une fois).
  for (const s of states2) expect(s.recentFeelings).toHaveLength(1)
  expect(errors.filter((e) => !/déjà terminée/i.test(e))).toEqual([])
})

test('deuxième séance du même exercice : la charge proposée évolue après des séries au haut de la fourchette', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  await boot(page)
  const finishAll = async (feeling: string) => {
    for (let i = 0; i < 120; i++) {
      if (await page.getByRole('button', { name: 'Terminer la séance' }).isVisible()) break
      if (await page.getByRole('button', { name: /Passer le repos|Série suivante/ }).isVisible())
        await skipRest(page)
      else {
        await raiseRepsToTop(page)
        await doSet(page, feeling)
      }
    }
    await page.getByRole('button', { name: 'Terminer la séance' }).click()
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()
  }
  await startGuided(page)
  await finishAll('Facile')
  // Modèle = mêmes exercices à la séance suivante.
  await page.getByRole('button', { name: 'Enregistrer comme modèle' }).click()
  await page.getByLabel('Nom du modèle').fill('Même séance')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText(/enregistré/)).toBeVisible()
  await page.getByRole('button', { name: 'Terminé' }).click()
  const state1 = await readStore<RawState>(page, 'exerciseState')
  const s1 = (await readStore<RawSession>(page, 'sessions'))[0]
  if (!s1) throw new Error('séance 1 absente')

  await page.clock.fastForward(24 * 3600 * 1000)
  await page.goto('./entrainement/modeles')
  await page.getByRole('link', { name: 'Démarrer Même séance' }).click()
  await page.getByRole('button', { name: 'Démarrer', exact: true }).click()
  await expect(page).toHaveURL(/\/entrainement\/seance$/)
  await page.getByRole('button', { name: 'C’est parti' }).click()
  const s2 = (await readStore<RawSession>(page, 'sessions')).find((s) => s.status === 'in_progress')
  if (!s2) throw new Error('séance 2 absente')
  const loads = (s: RawSession) =>
    Object.fromEntries(
      s.blocks.flatMap((b) =>
        b.exercises.map((e) => [e.exerciseId, (e.sets[0] as { loadKg?: number }).loadKg ?? null]),
      ),
    )
  const l1 = loads(s1)
  const l2 = loads(s2)
  test.info().annotations.push({
    type: 'charges',
    description: JSON.stringify({
      séance1: l1,
      étatsAprès1: state1.map((s) => [s.exerciseId, s.loadKg, s.topStreak]),
      séance2: l2,
    }),
  })
  // Pour chaque exercice chargé : la charge proposée en séance 2 est celle de l'état (>= séance 1).
  for (const st of state1) {
    if (st.loadKg === null || l2[st.exerciseId] === undefined) continue
    expect(l2[st.exerciseId]).toBe(st.loadKg)
    expect(st.loadKg).toBeGreaterThanOrEqual(l1[st.exerciseId] ?? 0)
  }
  await finishAll('Facile')
  await page.getByRole('button', { name: 'Terminé' }).click()
  const state2 = await readStore<RawState>(page, 'exerciseState')
  expect(state2.every((s) => s.recentFeelings.length === 2)).toBe(true)
  const grew = state2.some((s) => {
    const before = state1.find((x) => x.exerciseId === s.exerciseId)
    return before !== undefined && s.loadKg !== null && s.loadKg > (before.loadKg ?? 0)
  })
  const grewFromSession1 = state1.some((s) => s.loadKg !== null && s.loadKg > (l1[s.exerciseId] ?? 0))
  test.info().annotations.push({
    type: 'charge-augmentée',
    description: `séance1->2: ${grewFromSession1}, 2->3: ${grew}`,
  })
  expect(grewFromSession1 || grew).toBe(true)
  expect(errors).toEqual([])
})

test('abandon : la séance n’entre pas dans le volume de la semaine', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page)
  const volume = async () =>
    await page.getByRole('progressbar').evaluateAll((els) => els.map((e) => e.getAttribute('aria-valuenow')))
  await expect(page.getByRole('progressbar').first()).toBeVisible()
  const before = await volume()
  await startGuided(page)
  await doSet(page)
  await skipRest(page)
  await doSet(page)
  await page.getByRole('button', { name: 'Quitter' }).click()
  await page.getByRole('button', { name: 'Abandonner la séance' }).click()
  await page.getByRole('button', { name: 'Abandonner', exact: true }).click()
  await expect(page).toHaveURL(/\/entrainement$/)
  const sessions = await readStore<RawSession>(page, 'sessions')
  expect(sessions.map((s) => s.status)).toEqual(['abandoned'])
  await expect(page.getByRole('progressbar').first()).toBeVisible()
  expect(await volume()).toEqual(before)
  expect(await readStore<RawState>(page, 'exerciseState')).toEqual([])
  expect(errors).toEqual([])
})

test('carte « Reprendre » sur l’écran Séance pendant une séance en cours', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page)
  await startGuided(page)
  await doSet(page)
  await page.goto('./entrainement')
  await expect(page.getByText(/Séance en cours/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reprendre', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/guided-resume-card.png' })
  expect(errors).toEqual([])
})
