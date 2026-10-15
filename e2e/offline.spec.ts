import { expect, test } from '@playwright/test'

test("l'app s'ouvre hors ligne (lien profond + rechargement)", async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)')

  const controlled = async (): Promise<boolean> =>
    page.evaluate<boolean>('navigator.serviceWorker.controller !== null')
  if (!(await controlled())) await page.reload()
  await expect.poll(controlled).toBe(true)

  await context.setOffline(true)

  await page.goto('./nutrition')
  await page.reload()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nutrition')
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
})
