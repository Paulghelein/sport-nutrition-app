import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding, localDate } from './helpers.ts'

const settle = (page: Page) => page.waitForLoadState('networkidle')

const CHICKEN = 'Poulet, riz basmati et brocoli sauce soja'

/** Pastilles Journal · Recettes · Frigo · Courses (liens dans une navigation, `aria-current="page"` sur l’onglet actif). */
const sectionLink = (page: Page, name: string | RegExp) =>
  page.getByRole('navigation', { name: 'Sections de la nutrition' }).getByRole('link', { name })

async function start(page: Page) {
  await page.goto('./')
  await completeOnboarding(page)
  await settle(page)
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Nutrition' })
    .click()
  await sectionLink(page, 'Recettes').click()
  await expect(sectionLink(page, 'Recettes')).toHaveAttribute('aria-current', 'page')
  // Première préparation de Ciqual : les macros ne s'affichent qu'ensuite.
  await expect(page.getByRole('link', { name: new RegExp(CHICKEN) })).toBeVisible({ timeout: 40_000 })
}

test('recettes : 4 portions au frigo, une loguée depuis le frigo -> 3 restantes', async ({ page }) => {
  const errors = collectErrors(page)
  await start(page)
  await page.getByRole('link', { name: new RegExp(CHICKEN) }).click()
  await expect(page.getByRole('heading', { name: CHICKEN })).toBeVisible()
  await expect(page.getByTestId('kcal-per-serving')).toContainText('kcal')

  await page.getByRole('button', { name: 'Préparer pour le frigo' }).click()
  const prep = page.getByRole('dialog', { name: 'Préparer pour le frigo' })
  await expect(prep.getByText('À consommer avant le')).toBeVisible()
  await prep.getByRole('button', { name: 'Mettre au frigo' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'au frigo jusqu’au' })).toBeVisible()

  await page.getByRole('link', { name: 'Frigo', exact: true }).click()
  await expect(page.getByTestId('fridge-left')).toContainText('4')
  await page.getByRole('button', { name: /^Loguer une portion de/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Loguer une portion' })
  await expect(sheet.getByText('Depuis le frigo', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Ajouter au journal' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByTestId('fridge-left')).toContainText('3')
  expect(errors).toEqual([])
})

test('courses : deux recettes fusionnées par rayon, article coché', async ({ page }) => {
  const errors = collectErrors(page)
  await start(page)
  await page.goto('./nutrition/courses')
  await page.getByRole('button', { name: 'Choisir les recettes' }).click()
  const sheet = page.getByRole('dialog', { name: 'Recettes de la liste' })
  await sheet.getByRole('button', { name: `Ajouter ${CHICKEN}` }).click()
  await sheet.getByLabel('Rechercher une recette').fill('chili')
  await sheet
    .getByRole('button', { name: /^Ajouter Chili/ })
    .first()
    .click()
  await sheet.getByRole('button', { name: /^Générer la liste \(2 recettes\)/ }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Fruits et légumes' })).toBeVisible()
  await page.getByRole('checkbox').first().click()
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(1)
  await expect(page.getByTestId('shopping-progress')).toContainText('1 /')
  expect(errors).toEqual([])
})

test('import : exemple de IMPORT_FORMAT.md', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await settle(page)
  await page.goto('./reglages/importer')
  const json = JSON.stringify([
    {
      type: 'recipe',
      name: 'Poulet, riz basmati et brocoli (import)',
      meal: ['dejeuner', 'diner'],
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 25,
      fridgeDays: 4,
      tags: ['batch'],
      ingredients: [
        { name: 'Blanc de poulet cru', grams: 600, ciqualCode: '36005', aisle: 'boucherie' },
        {
          name: 'Riz basmati cru',
          grams: 320,
          aisle: 'epicerie',
          per100g: { kcal: 354, protein: 8.1, carbs: 77.5, fat: 0.9 },
        },
        { name: 'Brocoli', grams: 500, aisle: 'fruits-legumes' },
      ],
      steps: ['Cuire le riz.', 'Saisir le poulet en dés.', 'Répartir en 4 boîtes.'],
    },
    {
      type: 'meal',
      name: 'Burger frites au resto',
      date: localDate(0),
      slot: 'diner',
      estimated: true,
      totals: { kcal: 1150, protein: 45, carbs: 110, fat: 58 },
    },
  ])
  await page.getByLabel('Texte à importer').fill(json)
  await page.getByRole('button', { name: 'Analyser' }).click()
  await expect(page.getByRole('heading', { name: 'Aperçu' })).toBeVisible({ timeout: 40_000 })
  await expect(page.getByText('Burger frites au resto', { exact: true })).toBeVisible()
  await expect(page.getByText(/kcal · P/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Importer la sélection' }).click()
  await expect(page.getByText(/1 recette créée, 1 repas ajouté/)).toBeVisible()
  await page.getByRole('link', { name: 'Voir les recettes' }).click()
  await expect(page.getByRole('link', { name: /Poulet, riz basmati et brocoli \(import\)/ })).toBeVisible({
    timeout: 40_000,
  })
  expect(errors).toEqual([])
})

const openRecipe = async (page: Page, name: string) => {
  await page
    .getByRole('link', { name: new RegExp(name) })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(name) })).toBeVisible()
}

test('recette perso : créer, modifier, supprimer', async ({ page }) => {
  const errors = collectErrors(page)
  await start(page)
  await page.getByRole('link', { name: 'Créer une recette' }).click()
  await expect(page.getByRole('heading', { name: 'Nouvelle recette' })).toBeVisible()

  // Validation : une recette vide est refusée.
  await page.getByRole('button', { name: 'Créer la recette' }).click()
  await expect(page.getByText(/./).and(page.locator('[role="alert"]')).first()).toBeVisible()

  await page.getByLabel('Nom', { exact: true }).fill('Bol maison test')
  // Déjeuner est coché par défaut ; on ajoute le dîner.
  await expect(page.getByRole('checkbox', { name: 'Déjeuner', exact: true })).toBeChecked()
  await page.getByText('Dîner', { exact: true }).click()
  await page.getByLabel('Portions', { exact: true }).fill('2')
  await page.getByRole('button', { name: '+ Ajouter un ingrédient' }).click()
  await page.getByLabel('Ingrédient 1', { exact: true }).fill('Riz maison')
  await page.getByLabel('Quantité 1', { exact: true }).fill('200')
  await page.getByLabel('Saisir les valeurs de l’ingrédient 1').click()
  await page.getByLabel('Calories (kcal) / 100 g').fill('350')
  await page.getByRole('button', { name: 'Ajouter une étape' }).click()
  await page.getByLabel('Étape 1', { exact: true }).fill('Cuire le riz.')
  await expect(page.getByRole('checkbox', { name: 'Déjeuner', exact: true })).toBeChecked()
  await expect(page.getByTestId('live-macros')).toBeVisible()
  await page.getByRole('button', { name: 'Créer la recette' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Bol maison test' })).toBeVisible()
  await expect(page.getByText('Perso', { exact: true })).toBeVisible()
  // 200 g * 3,5 kcal / 2 portions = 350 kcal
  await expect(page.getByTestId('kcal-per-serving')).toContainText('350')

  // Modification
  await page.getByRole('link', { name: 'Modifier', exact: true }).click()
  await page.getByLabel('Nom', { exact: true }).fill('Bol maison renommé')
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Bol maison renommé' })).toBeVisible()

  // Suppression (définitive pour une recette perso)
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page).toHaveURL(/\/nutrition\/recettes$/)
  await expect(page.getByRole('link', { name: /Bol maison renommé/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('recette de départ : modifier puis rétablir l’original', async ({ page }) => {
  const errors = collectErrors(page)
  await start(page)
  await openRecipe(page, CHICKEN)
  await expect(page.getByRole('button', { name: 'Rétablir l’original' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Modifier', exact: true }).click()
  await expect(page.getByText('Ta version remplacera l’original')).toBeVisible()
  await page.getByLabel('Nom', { exact: true }).fill('Poulet modifié test')
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Poulet modifié test' })).toBeVisible()
  await expect(page.getByText('Modifiée', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Rétablir l’original' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Rétablir', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: CHICKEN })).toBeVisible()
  await expect(page.getByText('Modifiée', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('recette de départ supprimée : restaurable', async ({ page }) => {
  const errors = collectErrors(page)
  await start(page)
  await openRecipe(page, CHICKEN)
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page).toHaveURL(/\/nutrition\/recettes$/)
  await expect(page.getByRole('link', { name: new RegExp(CHICKEN) })).toHaveCount(0)
  await page.getByRole('button', { name: /^Recettes supprimées \(1\)/ }).click()
  await page.getByRole('button', { name: `Restaurer ${CHICKEN}` }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('link', { name: new RegExp(CHICKEN) })).toBeVisible()
  expect(errors).toEqual([])
})

test('liste : filtre protéines par portion', async ({ page }) => {
  const errors = collectErrors(page)
  await start(page)
  const count = async () =>
    Number(((await page.getByText(/^\d+ recettes?$/).textContent()) ?? '').replace(/\D/g, ''))
  const total = await count()
  expect(total).toBeGreaterThan(30)
  await page.getByRole('button', { name: /^Filtres/ }).click()
  await page
    .getByRole('group', { name: 'Protéines minimum par portion' })
    .getByText('40 g', { exact: true })
    .click()
  await expect.poll(count).toBeLessThan(total)
  const filtered = await count()
  expect(filtered).toBeGreaterThan(0)
  // Chaque ligne affichée respecte le seuil.
  const rows = await page.locator('ul a[href*="/nutrition/recettes/"]').allInnerTexts()
  expect(rows.length).toBe(filtered)
  for (const r of rows) {
    const m = /P\s*([\d\s\u00a0\u202f]+(?:,\d+)?)\s*g/.exec(r)
    expect(m, r).not.toBeNull()
    expect(Number((m?.[1] ?? '0').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'))).toBeGreaterThanOrEqual(
      39.5,
    )
  }
  await page.getByRole('button', { name: /^Filtres/ }).click()
  expect(errors).toEqual([])
})

test('mode cuisine : portions x2 -> grammes doublés, étapes', async ({ page }) => {
  const errors = collectErrors(page)
  await start(page)
  await openRecipe(page, CHICKEN)
  await page.getByRole('link', { name: 'Cuisiner' }).click()
  await expect(page.getByText(/600\s?g/).first()).toBeVisible()
  // Plein écran : pas de barre d’onglets en mode cuisine.
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Augmenter : Portions à cuisiner' }).click()
  await page.getByRole('button', { name: 'Augmenter : Portions à cuisiner' }).click()
  await page.getByRole('button', { name: 'Augmenter : Portions à cuisiner' }).click()
  await page.getByRole('button', { name: 'Augmenter : Portions à cuisiner' }).click()
  await expect(page.getByLabel('Portions à cuisiner : 8')).toBeVisible()
  await expect(page.getByText(/1,2\s?kg/).first()).toBeVisible()
  await expect(page.getByText(/640\s?g/).first()).toBeVisible()

  // Cocher un ingrédient
  const first = page.getByRole('checkbox').first()
  await first.click()
  await expect(first).toBeChecked()

  await page.getByRole('button', { name: 'Voir les étapes' }).click()
  await expect(page.getByText('Étape 1 sur 5')).toBeVisible()
  await expect(page.getByTestId('cook-step')).toContainText('Cuire le riz')
  await page.getByRole('button', { name: 'Fait, étape suivante' }).click()
  await expect(page.getByText('Étape 2 sur 5')).toBeVisible()
  await page.getByRole('button', { name: 'Précédente' }).click()
  await expect(page.getByText('Étape 1 sur 5')).toBeVisible()
  await page.getByRole('button', { name: 'Étape 5' }).click()
  await page.getByRole('button', { name: 'Fait, terminer' }).click()
  await expect(page.getByText('C’est prêt !')).toBeVisible()
  await page.getByRole('button', { name: 'Mettre au frigo' }).click()
  const prep = page.getByRole('dialog', { name: 'Préparer pour le frigo' })
  await expect(prep).toBeVisible()
  await expect(prep.getByLabel('Portions préparées : 8')).toBeVisible()
  expect(errors).toEqual([])
})

test('frigo : loguer une portion, Annuler la rend au frigo et retire l’entrée du journal', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await start(page)
  await openRecipe(page, CHICKEN)
  await page.getByRole('button', { name: 'Préparer pour le frigo' }).click()
  await page
    .getByRole('dialog', { name: 'Préparer pour le frigo' })
    .getByRole('button', { name: 'Mettre au frigo' })
    .click()
  await expect(page.getByRole('status').filter({ hasText: 'au frigo jusqu’au' })).toBeVisible()

  await page.goto('./nutrition/frigo')
  await expect(page.getByTestId('fridge-left')).toContainText('4')
  await page.getByRole('button', { name: /^Loguer une portion de/ }).click()
  await page
    .getByRole('dialog', { name: 'Loguer une portion' })
    .getByRole('button', { name: 'Ajouter au journal' })
    .click()
  await expect(page.getByTestId('fridge-left')).toContainText('3')
  const notice = page.getByRole('status').filter({ hasText: 'Ajouté au journal' })
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByTestId('fridge-left')).toContainText('4')
  await expect(page.getByRole('status').filter({ hasText: 'Annulé' })).toBeVisible()

  await sectionLink(page, 'Journal').click()
  await expect(page.getByTestId('kcal-consumed')).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`^Modifier ${CHICKEN}`) })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('courses : régénérer garde les cases cochées, article manuel', async ({ page }) => {
  const errors = collectErrors(page)
  await start(page)
  await page.goto('./nutrition/courses')
  await page.getByRole('button', { name: 'Choisir les recettes' }).click()
  const sheet = page.getByRole('dialog', { name: 'Recettes de la liste' })
  await sheet.getByRole('button', { name: `Ajouter ${CHICKEN}` }).click()
  await sheet.getByRole('button', { name: /^Générer la liste/ }).click()
  await expect(sheet).toBeHidden()

  const boxes = page.getByRole('checkbox')
  const name = (await boxes.first().innerText()).split('\n')[0] ?? ''
  await boxes.first().click()
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(1)

  await page.getByRole('button', { name: 'Régénérer' }).click()
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(1)
  await expect(page.getByRole('checkbox', { checked: true }).first()).toContainText(name.trim())

  // Article manuel
  await page.getByRole('button', { name: 'Ajouter un article' }).click()
  const manual = page.getByRole('dialog', { name: 'Ajouter un article' })
  await manual.getByLabel('Article').fill('Papier toilette test')
  await manual.getByRole('button', { name: 'Ajouter' }).click()
  await expect(manual).toBeHidden()
  await expect(page.getByRole('checkbox', { name: /Papier toilette test/ })).toBeVisible()
  // Régénérer ne supprime pas l'article manuel
  await page.getByRole('button', { name: 'Régénérer' }).click()
  await expect(page.getByRole('checkbox', { name: /Papier toilette test/ })).toBeVisible()
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(1)
  // Suppression de l'article manuel
  await page.getByRole('button', { name: 'Supprimer Papier toilette test' }).click()
  await expect(page.getByRole('checkbox', { name: /Papier toilette test/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('import : élément invalide affiché avec son erreur, élément décoché non importé', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await settle(page)
  await page.goto('./reglages/importer')
  const good = (name: string) => ({
    type: 'recipe',
    name,
    meal: ['dejeuner'],
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 5,
    ingredients: [
      {
        name: 'Riz test',
        grams: 200,
        aisle: 'epicerie',
        per100g: { kcal: 350, protein: 7, carbs: 77, fat: 1 },
      },
    ],
    steps: ['Cuire.'],
  })
  const json = JSON.stringify([
    good('Recette gardée test'),
    good('Recette décochée test'),
    { type: 'recipe', name: 'Recette cassée test', servings: 'beaucoup' },
  ])
  await page.getByLabel('Texte à importer').fill(json)
  await page.getByRole('button', { name: 'Analyser' }).click()
  await expect(page.getByRole('heading', { name: 'Aperçu' })).toBeVisible({ timeout: 40_000 })
  await expect(page.getByText('Élément 3 invalide')).toBeVisible()
  // Le message d'erreur est affiché (au moins une ligne dans la carte rouge)
  const card = page.locator('li').filter({ hasText: 'Élément 3 invalide' })
  await expect(card.locator('li')).not.toHaveCount(0)
  await expect(card.locator('li').first()).not.toHaveText('')
  await page.getByLabel('Importer la recette Recette décochée test').uncheck()
  await expect(page.getByText(/À enregistrer/)).toContainText('1 recette')
  await page.getByRole('button', { name: 'Importer la sélection' }).click()
  await expect(page.getByText(/1 recette créée, 0 repas ajouté/)).toBeVisible()
  await page.getByRole('link', { name: 'Voir les recettes' }).click()
  await expect(page.getByRole('link', { name: /Recette gardée test/ })).toBeVisible({ timeout: 40_000 })
  await expect(page.getByRole('link', { name: /Recette décochée test/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('import : JSON illisible -> erreur, rien d’enregistré', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await completeOnboarding(page)
  await settle(page)
  await page.goto('./reglages/importer')
  await page.getByLabel('Texte à importer').fill('ceci n’est pas du json')
  await page.getByRole('button', { name: 'Analyser' }).click()
  await expect(page.getByRole('heading', { name: 'Aperçu' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 40_000 })
  expect(errors).toEqual([])
})

test('frigo : loguer la dernière portion retire la ligne, journal avec macros figées', async ({ page }) => {
  const errors = collectErrors(page)
  await start(page)
  await openRecipe(page, CHICKEN)
  const kcalText = (await page.getByTestId('kcal-per-serving').innerText()).replace(/\D/g, '')
  const perServing = Number(kcalText)
  expect(perServing).toBeGreaterThan(100)

  // 1 portion au frigo
  await page.getByRole('button', { name: 'Préparer pour le frigo' }).click()
  const prep = page.getByRole('dialog', { name: 'Préparer pour le frigo' })
  for (let i = 0; i < 3; i++)
    await prep.getByRole('button', { name: 'Diminuer : Portions préparées' }).click()
  await expect(prep.getByLabel('Portions préparées : 1')).toBeVisible()
  await prep.getByRole('button', { name: 'Mettre au frigo' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'au frigo jusqu’au' })).toBeVisible()

  await page.getByRole('link', { name: 'Frigo', exact: true }).click()
  await expect(page.getByTestId('fridge-left')).toContainText('1')
  await page.getByRole('button', { name: /^Loguer une portion de/ }).click()
  await page
    .getByRole('dialog', { name: 'Loguer une portion' })
    .getByRole('button', { name: 'Ajouter au journal' })
    .click()
  await expect(page.getByText('Le frigo est vide')).toBeVisible()
  await expect(page.getByTestId('fridge-left')).toHaveCount(0)

  // Journal du jour : l'entrée est là, macros figées
  await sectionLink(page, 'Journal').click()
  await expect(page.getByTestId('kcal-consumed')).toBeVisible()
  const consumed = Number(((await page.getByTestId('kcal-consumed').textContent()) ?? '').replace(/\D/g, ''))
  expect(Math.abs(consumed - perServing)).toBeLessThanOrEqual(1)
  const entry = page.getByRole('button', { name: new RegExp(`^Modifier ${CHICKEN}`) })
  await expect(entry).toBeVisible()

  // Macros figées : supprimer la recette ne change pas le journal.
  await page.goto('./nutrition/recettes')
  await openRecipe(page, CHICKEN)
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click()
  await page.goto('./nutrition')
  await expect(page.getByTestId('kcal-consumed')).toHaveText(String(consumed))
  expect(errors).toEqual([])
})

test.describe('journal : portion de recette', () => {
  test('ajouter une portion depuis le frigo via l’écran Ajouter', async ({ page }) => {
    const errors = collectErrors(page)
    await start(page)
    await page.getByRole('link', { name: new RegExp(CHICKEN) }).click()
    await page.getByRole('button', { name: 'Préparer pour le frigo' }).click()
    await page
      .getByRole('dialog', { name: 'Préparer pour le frigo' })
      .getByRole('button', { name: 'Mettre au frigo' })
      .click()
    await expect(page.getByRole('status').filter({ hasText: 'au frigo jusqu’au' })).toBeVisible()

    await page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link', { name: 'Nutrition' })
      .click()
    await expect(sectionLink(page, 'Frigo, 4 portions')).toBeVisible()
    await page.getByRole('link', { name: 'Ajouter au repas : Déjeuner' }).click()
    await page.getByRole('button', { name: 'Portion de recette' }).click()
    const picker = page.getByRole('dialog', { name: 'Portion de recette' })
    await expect(picker.getByRole('heading', { name: 'Au frigo' })).toBeVisible()
    await picker.getByRole('button', { name: new RegExp(CHICKEN) }).click()
    const sheet = page.getByRole('dialog', { name: 'Loguer une portion' })
    await expect(sheet.getByText('Depuis le frigo', { exact: true })).toBeVisible()
    await sheet.getByRole('button', { name: 'Ajouter au journal' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Ajouté : ' })).toBeVisible()
    await page.getByRole('button', { name: /^Terminer \(1 ajouté/ }).click()
    await expect(page.getByRole('button', { name: /^Modifier Poulet, riz basmati.*kcal/ })).toBeVisible()
    await expect(sectionLink(page, 'Frigo, 3 portions')).toBeVisible()
    expect(errors).toEqual([])
  })
})

test.describe('annulation et base d’aliments en échec', () => {
  // Sans service worker, `page.route` intercepte bien le chunk Ciqual.
  test.use({ serviceWorkers: 'block' })

  test('annuler une portion prise au frigo rend les portions (ligne recréée à 0)', async ({ page }) => {
    const errors = collectErrors(page)
    await start(page)
    await page.getByRole('link', { name: new RegExp(CHICKEN) }).click()
    await page.getByRole('button', { name: 'Préparer pour le frigo' }).click()
    const prep = page.getByRole('dialog', { name: 'Préparer pour le frigo' })
    // 1 portion seulement : la loguer vide la ligne du frigo.
    for (let i = 0; i < 3; i++) await prep.getByRole('button', { name: /^Diminuer/ }).click()
    await prep.getByRole('button', { name: 'Mettre au frigo' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'au frigo jusqu’au' })).toBeVisible()

    await page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link', { name: 'Nutrition' })
      .click()
    await page.getByRole('link', { name: 'Ajouter au repas : Déjeuner' }).click()
    await page.getByRole('button', { name: 'Portion de recette' }).click()
    await page
      .getByRole('dialog', { name: 'Portion de recette' })
      .getByRole('button', { name: new RegExp(CHICKEN) })
      .click()
    await page
      .getByRole('dialog', { name: 'Loguer une portion' })
      .getByRole('button', { name: 'Ajouter au journal' })
      .click()
    const toast = page.getByRole('status').filter({ hasText: 'Ajouté : ' })
    await expect(toast).toBeVisible()
    await toast.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByRole('button', { name: /^Terminer/ })).toBeHidden()

    await page.getByRole('link', { name: 'Journal' }).click()
    await expect(sectionLink(page, 'Frigo, 1 portion')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('Ciqual en échec : bandeau, ≈ sur les recettes, ajout au journal bloqué', async ({ page }) => {
    await page.route('**/assets/ciqual-*.js', (route) => route.abort())
    await page.goto('./')
    await completeOnboarding(page)
    await settle(page)
    await page.goto('./nutrition/recettes')
    await expect(page.getByRole('alert').filter({ hasText: 'Base d’aliments non chargée' })).toBeVisible({
      timeout: 40_000,
    })
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible()
    await expect(page.getByText('Macros incomplètes, environ').first()).toBeVisible()
    await page.getByRole('link', { name: new RegExp(CHICKEN) }).click()
    await page.getByRole('button', { name: 'Loguer une portion' }).click()
    const sheet = page.getByRole('dialog', { name: 'Loguer une portion' })
    await expect(sheet.getByRole('button', { name: 'Ajouter au journal' })).toBeDisabled()
  })
})
