/// <reference lib="dom" />
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding } from './helpers.ts'

/**
 * Exercices de départ lus dans src/content/exercises/*.ts (ligne `id:` / `name:` à 4 espaces).
 * On n'importe pas `src/content` : `import.meta.glob` (SVG) et les imports sans extension ne passent pas sous Node.
 */
async function loadSeeds(): Promise<{ id: string; name: string }[]> {
  const dir = join(process.cwd(), 'src', 'content', 'exercises')
  const out: { id: string; name: string }[] = []
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.ts') && f !== 'meta.ts')) {
    const text = await readFile(join(dir, file), 'utf8')
    const ids = [...text.matchAll(/^ {4}id: '([^']+)',$/gm)].map((m) => m[1] ?? '')
    const names = [...text.matchAll(/^ {4}name: '((?:[^'\\]|\\.)+)',$/gm)].map((m) =>
      (m[1] ?? '').replace(/\\'/g, "'"),
    )
    expect(names.length, file).toBe(ids.length)
    ids.forEach((id, i) => out.push({ id, name: names[i] ?? '' }))
  }
  return out
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' })

async function openLibrary(page: Page) {
  await page.goto('./')
  await completeOnboarding(page)
  await page.getByRole('link', { name: /Bibliothèque d’exercices/ }).click()
  await expect(page).toHaveURL(/\/seance\/exercices$/)
  await expect(page.getByRole('heading', { name: 'Exercices', level: 1 })).toBeVisible()
}

/** Ligne de la liste, repérée par l’id de l’exercice (les noms se préfixent : « Pompes », « Pompes archer »). */
const row = (page: Page, id: string) => page.locator(`a[href$="/seance/exercices/${id}"]`)

test('liste : recherche sans accent, filtre par schéma, panneau Filtres', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)

  await page.getByLabel('Rechercher un exercice').fill('developpe')
  await expect(row(page, 'standing-press')).toBeVisible()
  await expect(row(page, 'push-up')).toHaveCount(0)
  await page.getByRole('button', { name: 'Effacer la recherche' }).click()

  // Filtre par schéma
  const patterns = page.getByRole('group', { name: 'Filtrer par schéma de mouvement' })
  await patterns.getByRole('button', { name: 'Tirage', exact: true }).click()
  await expect(patterns.getByRole('button', { name: 'Tirage', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(row(page, 'gorilla-row')).toBeVisible()
  await expect(row(page, 'push-up')).toHaveCount(0)
  await patterns.getByRole('button', { name: 'Tous', exact: true }).click()

  // Matériel : par défaut ni barre de traction ni table
  await expect(row(page, 'pull-up')).toHaveCount(0)
  await expect(row(page, 'australian-row')).toHaveCount(0)
  await page.getByRole('button', { name: 'Filtres' }).click()
  const panel = page.locator('#library-filters')
  await expect(panel).toBeVisible()
  await panel.getByRole('switch', { name: 'Avec mon matériel' }).click()
  await expect(row(page, 'pull-up')).toBeVisible()
  await expect(row(page, 'australian-row')).toBeVisible()
  await expect(page.getByText('Matériel manquant').first()).toBeVisible()

  // Niveau
  await panel
    .getByRole('radio', { name: 'Avancé' })
    .check({ force: true })
    .catch(async () => {
      await panel.getByText('Avancé', { exact: true }).click()
    })
  await expect(row(page, 'pull-up')).toBeVisible()
  await expect(row(page, 'side-plank')).toHaveCount(0)
  await page.getByLabel('Rechercher un exercice').fill('zzzz')
  await expect(page.getByText('Aucun exercice trouvé')).toBeVisible()
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click()
  await expect(row(page, 'incline-push-up')).toBeVisible()

  expect(errors).toEqual([])
})

test('chaque exercice de départ a une fiche lisible sur iPhone', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  await openLibrary(page)
  const seeds = await loadSeeds()
  expect(seeds.length).toBeGreaterThanOrEqual(30)

  const problems: string[] = []
  for (const ex of seeds) {
    await page.goto(`./seance/exercices/${ex.id}`)
    const title = page.getByRole('heading', { level: 1, name: ex.name, exact: true })
    try {
      await expect(title).toBeVisible({ timeout: 5000 })
    } catch {
      problems.push(`${ex.id}: titre « ${ex.name} » absent`)
      continue
    }
    const info = await page.evaluate(() => {
      const svg = document.querySelector('article [role="img"] svg')
      const main = document.querySelector('main')
      const se = document.scrollingElement
      return {
        svgChildren: svg ? svg.children.length : -1,
        svgBox: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
        doc: se ? se.scrollWidth - window.innerWidth : 0,
        main: main ? main.scrollWidth - main.clientWidth : 0,
        h2: [...document.querySelectorAll('article h2')].map((h) => h.textContent ?? ''),
      }
    })
    if (info.svgChildren <= 0) problems.push(`${ex.id}: illustration absente ou SVG vide`)
    else if (info.svgBox < 100) problems.push(`${ex.id}: illustration trop petite (${info.svgBox}px)`)
    for (const s of ['Étapes', 'Points clés']) {
      if (!info.h2.includes(s)) problems.push(`${ex.id}: section « ${s} » absente`)
    }
    if (info.doc > 0) problems.push(`${ex.id}: défilement horizontal document (+${info.doc}px)`)
    if (info.main > 0) problems.push(`${ex.id}: défilement horizontal main (+${info.main}px)`)
  }
  expect(problems).toEqual([])
  expect(errors).toEqual([])
})

test('préférences : Je n’aime pas (icône) puis Masquer (absent, visible avec Afficher les masqués)', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await openLibrary(page)
  await row(page, 'goblet-squat-tempo').click()
  const prefs = page.getByRole('group', { name: 'Pour la génération des séances' })
  await prefs.getByText('Je n’aime pas', { exact: true }).click()
  await expect(prefs.getByRole('radio', { name: 'Je n’aime pas' })).toBeChecked()
  await page.getByRole('link', { name: 'Bibliothèque' }).click()
  await expect(row(page, 'goblet-squat-tempo').getByRole('img', { name: 'Je n’aime pas' })).toBeVisible()

  await row(page, 'goblet-squat-tempo').click()
  await page
    .getByRole('group', { name: 'Pour la génération des séances' })
    .getByText('Masquer', { exact: true })
    .click()
  await expect(prefs.getByRole('radio', { name: 'Masquer' })).toBeChecked()
  await page.getByRole('link', { name: 'Bibliothèque' }).click()
  await expect(row(page, 'goblet-squat-tempo')).toHaveCount(0)

  await page.getByRole('button', { name: 'Filtres' }).click()
  await page.getByRole('switch', { name: 'Afficher les masqués' }).click()
  const hidden = row(page, 'goblet-squat-tempo')
  await expect(hidden).toBeVisible()
  await expect(hidden).toContainText('Masqué')
  expect(errors).toEqual([])
})

test('modifier un exercice de départ puis rétablir l’original', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)
  await row(page, 'push-up').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Pompes', exact: true })).toBeVisible()
  await expect(page.getByText('6 à 15 répétitions')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rétablir l’original' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Modifier' }).click()
  await page.getByLabel('Répétitions min').fill('7')
  await page.getByLabel('Répétitions max').fill('9')
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
  await expect(page).toHaveURL(/\/seance\/exercices\/push-up$/)
  await expect(page.getByText('7 à 9 répétitions')).toBeVisible()
  await expect(page.getByText('· Modifié')).toBeVisible()

  await page.getByRole('button', { name: 'Rétablir l’original' }).click()
  await page
    .getByRole('dialog', { name: 'Rétablir l’original ?' })
    .getByRole('button', { name: 'Rétablir' })
    .click()
  await expect(page.getByText('6 à 15 répétitions')).toBeVisible()
  await expect(page.getByText('· Modifié')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Rétablir l’original' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('créer un exercice perso (erreur de validation d’abord) puis le supprimer', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)
  await page.getByRole('link', { name: 'Créer un exercice' }).click()
  await expect(page.getByRole('heading', { name: 'Nouvel exercice', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Créer l’exercice' }).click()
  await expect(page.getByText('Le nom de l’exercice est obligatoire.')).toBeVisible()

  await page.getByLabel('Nom', { exact: true }).fill('Curl test e2e')
  await page.getByRole('button', { name: 'Créer l’exercice' }).click()
  await expect(page.getByText('Choisis au moins un muscle principal.')).toBeVisible()

  await page.getByRole('group', { name: 'Muscles principaux' }).getByText('Biceps', { exact: true }).click()
  await page.getByRole('button', { name: '+ Ajouter une étape' }).click()
  await page.getByLabel('Étape 1', { exact: true }).fill('Plie le coude.')
  await page.getByRole('button', { name: '+ Ajouter un point clé' }).click()
  await page.getByLabel('Point clé 1', { exact: true }).fill('Coude fixe.')
  await page.getByRole('button', { name: 'Créer l’exercice' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Curl test e2e' })).toBeVisible()
  await expect(page.getByText('· Perso')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Étapes' })).toBeVisible()

  await page.getByRole('link', { name: 'Bibliothèque' }).click()
  const created = page.getByRole('link', { name: /^Curl test e2e/ })
  await expect(created).toBeVisible()
  await expect(created).toContainText('Perso')

  await created.click()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Supprimer cet exercice ?' })
  await expect(dialog).toContainText('disparaîtra de la bibliothèque')
  await dialog.getByRole('button', { name: 'Supprimer' }).click()
  await expect(page).toHaveURL(/\/seance\/exercices$/)
  await expect(page.getByRole('link', { name: /^Curl test e2e/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Exercices supprimés \(0\)/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('supprimer un exercice de départ puis le restaurer', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)
  await row(page, 'archer-push-up').click()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Supprimer cet exercice ?' })
  await expect(dialog).toContainText('Exercices supprimés')
  await dialog.getByRole('button', { name: 'Supprimer' }).click()
  await expect(page).toHaveURL(/\/seance\/exercices$/)
  await expect(row(page, 'archer-push-up')).toHaveCount(0)

  await page.getByRole('link', { name: 'Exercices supprimés (1)' }).click()
  await expect(page.getByText('Pompes archer')).toBeVisible()
  await page.getByRole('button', { name: 'Restaurer Pompes archer' }).click()
  await expect(page.getByText('Aucun exercice supprimé')).toBeVisible()
  await page.getByRole('link', { name: 'Bibliothèque' }).click()
  await expect(row(page, 'archer-push-up')).toBeVisible()
  expect(errors).toEqual([])
})

test('la sauvegarde contient les surcharges et les restaure à l’import', async ({ page }) => {
  const errors = collectErrors(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
  })
  await openLibrary(page)
  await row(page, 'push-up').click()
  await page.getByRole('link', { name: 'Modifier' }).click()
  await page.getByLabel('Répétitions min').fill('7')
  await page.getByLabel('Répétitions max').fill('9')
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
  await expect(page.getByText('7 à 9 répétitions')).toBeVisible()

  await nav(page).getByRole('link', { name: 'Réglages' }).click()
  await page.getByRole('button', { name: 'Préparer la sauvegarde' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Télécharger le fichier' }).click()
  const download = await downloadPromise
  await page.getByRole('button', { name: 'C’est enregistré' }).click()
  const content = await readFile(await download.path(), 'utf8')
  const parsed = JSON.parse(content) as { tables: { exercises?: { id: string; source: string }[] } }
  expect(parsed.tables.exercises?.some((e) => e.id === 'push-up' && e.source === 'seed')).toBe(true)

  // Rétablir l'original, puis réimporter (Remplacer) : la surcharge revient.
  await page.goto('./seance/exercices/push-up')
  await page.getByRole('button', { name: 'Rétablir l’original' }).click()
  await page
    .getByRole('dialog', { name: 'Rétablir l’original ?' })
    .getByRole('button', { name: 'Rétablir' })
    .click()
  await expect(page.getByText('6 à 15 répétitions')).toBeVisible()

  await nav(page).getByRole('link', { name: 'Réglages' }).click()
  await page.getByLabel('Choisir un fichier').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  })
  await page.getByRole('button', { name: 'Remplacer toutes mes données' }).click()
  await page
    .getByRole('dialog', { name: 'Tout remplacer ?' })
    .getByRole('button', { name: 'Oui, tout remplacer' })
    .click()
  await expect(page.getByText(/Sauvegarde importée/)).toBeVisible()

  await nav(page).getByRole('link', { name: 'Séance' }).click()
  await page.getByRole('link', { name: /Bibliothèque d’exercices/ }).click()
  await row(page, 'push-up').click()
  await expect(page.getByText('7 à 9 répétitions')).toBeVisible()
  expect(errors).toEqual([])
})

async function startNewExercise(page: Page, name: string) {
  await page.getByRole('link', { name: 'Créer un exercice' }).click()
  await page.getByLabel('Nom', { exact: true }).fill(name)
  await page.getByRole('group', { name: 'Muscles principaux' }).getByText('Biceps', { exact: true }).click()
}

test('exercice kettlebell : cible Durée affichée sur la fiche, puis retour aux Répétitions', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)
  await startNewExercise(page, 'Portage test e2e')
  await page.getByRole('group', { name: 'Type de charge' }).getByText('Kettlebell', { exact: true }).click()
  await page.getByRole('group', { name: 'Cible de chaque série' }).getByText('Durée', { exact: true }).click()
  await page.getByLabel('Durée min').fill('30')
  await page.getByLabel('Durée max').fill('60')
  await expect(page.getByLabel('Répétitions min')).toHaveCount(0)
  await page.getByRole('button', { name: 'Créer l’exercice' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Portage test e2e' })).toBeVisible()
  await expect(page.getByText('30 à 60 s', { exact: true })).toBeVisible()
  await expect(page.getByText(/répétitions/)).toHaveCount(0)

  await page.getByRole('link', { name: 'Modifier' }).click()
  await page.getByRole('group', { name: 'Cible de chaque série' }).getByText('Répétitions', { exact: true }).click()
  await page.getByLabel('Répétitions min').fill('8')
  await page.getByLabel('Répétitions max').fill('12')
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
  await expect(page.getByText('8 à 12 répétitions')).toBeVisible()
  await expect(page.getByText('30 à 60 s', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('étapes : monter / descendre, l’ordre est respecté sur la fiche', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)
  await startNewExercise(page, 'Ordre test e2e')
  for (const n of [1, 2, 3]) {
    await page.getByRole('button', { name: '+ Ajouter une étape' }).click()
    await page.getByLabel(`Étape ${n}`, { exact: true }).fill(`Alpha${n}`)
  }
  // A1 A2 A3 -> descendre 1 : A2 A1 A3 -> monter 3 : A2 A3 A1
  await page.getByRole('button', { name: 'Descendre Étape 1' }).click()
  await expect(page.getByLabel('Étape 1', { exact: true })).toHaveValue('Alpha2')
  await page.getByRole('button', { name: 'Monter Étape 3' }).click()
  await expect(page.getByLabel('Étape 2', { exact: true })).toHaveValue('Alpha3')
  await expect(page.getByLabel('Étape 3', { exact: true })).toHaveValue('Alpha1')
  await page.getByRole('button', { name: 'Créer l’exercice' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Ordre test e2e' })).toBeVisible()
  const steps = page.locator('article ol li')
  await expect(steps).toHaveCount(3)
  await expect(steps.nth(0)).toContainText('Alpha2')
  await expect(steps.nth(1)).toContainText('Alpha3')
  await expect(steps.nth(2)).toContainText('Alpha1')
  expect(errors).toEqual([])
})

test('Farmer carry affiche une durée', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)
  await row(page, 'farmer-carry').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Farmer carry', exact: true })).toBeVisible()
  await expect(page.getByText('30 à 60 s', { exact: true })).toBeVisible()
  await expect(page.getByText(/répétitions/)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('enregistrer un exercice de départ sans rien changer ne crée pas de surcharge', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)
  await row(page, 'push-up').click()
  await page.getByRole('link', { name: 'Modifier' }).click()
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
  await expect(page).toHaveURL(/\/seance\/exercices\/push-up$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Pompes', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rétablir l’original' })).toHaveCount(0)
  await expect(page.getByText('· Modifié')).toHaveCount(0)
  expect(errors).toEqual([])
})
