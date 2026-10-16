import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Parcourt l'onboarding avec des valeurs par défaut et arrive sur /seance. */
export async function completeOnboarding(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Commencer' }).click()
  await page.getByLabel('Date de naissance').fill('1998-05-12')
  await page.getByLabel('Taille').fill('178')
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByLabel('Poids actuel').fill('72,5')
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()
  await expect(page).toHaveURL(/\/seance$/)
}

/** Collecte les erreurs console / page ; à vérifier en fin de test avec `expect(errors).toEqual([])`. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    // WebKit signale ainsi un import() interrompu par une navigation du test (reload, goto) — ex. le préchargement
    // Ciqual en tâche de fond. Un vrai échec de chargement afficherait une erreur à l'écran, vérifiée par les tests.
    if (m.type() === 'error' && !m.text().includes('Importing a module script failed')) errors.push(m.text())
  })
  page.on('pageerror', (e) => {
    // Même cas que ci-dessus, remonté comme rejet non géré.
    if (!e.message.includes('Importing a module script failed')) errors.push(e.message)
  })
  return errors
}

/** Date locale AAAA-MM-JJ décalée de `offsetDays` jours par rapport à aujourd'hui. */
export function localDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
