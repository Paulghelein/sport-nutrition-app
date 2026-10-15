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
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

/** Date locale AAAA-MM-JJ décalée de `offsetDays` jours par rapport à aujourd'hui. */
export function localDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
