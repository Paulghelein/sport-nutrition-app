import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { collectErrors, completeOnboarding, openSettings } from './helpers.ts'

// Régression : lire un Blob (`await blob.arrayBuffer()`) dans une transaction Dexie fait commettre IndexedDB
// prématurément (PrematureCommitError) dans un vrai navigateur ; fake-indexeddb (Vitest) ne le voit pas.
// Aucun écran n'enregistre encore de photo (avant R3) : on écrit les lignes `foods` + `foodPhotos` directement dans
// IndexedDB (base `forge`, v3), comme le ferait `cacheOffFoodWithPhoto`.

const EAN = '3017620422003'
/** Octets JPEG factices (SOI + JFIF + EOI) : le contenu n'a pas besoin d'être décodable, seulement de survivre. */
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x03, 0xff, 0xd9]

async function forceDownloadPath(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
  })
}

async function seedPhoto(page: Page, ean: string, bytes: number[]) {
  await page.evaluate(
    async ({ ean, bytes }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('forge')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      if (!db.objectStoreNames.contains('foodPhotos')) throw new Error('table foodPhotos absente (schéma < v3)')
      const now = new Date().toISOString()
      const food = {
        id: `off-${ean}`,
        name: 'Pâte à tartiner test',
        source: 'off',
        ean,
        brand: 'Test',
        per100g: { kcal: 540, protein: 6, carbs: 57, fat: 31 },
        favorite: false,
        updatedAt: now,
      }
      const photo = {
        foodId: `off-${ean}`,
        mime: 'image/jpeg',
        bytes: new Uint8Array(bytes).buffer,
        fetchedAt: now,
      }
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['foods', 'foodPhotos'], 'readwrite')
        tx.objectStore('foods').put(food)
        tx.objectStore('foodPhotos').put(photo)
        tx.oncomplete = () => resolve()
        tx.onerror = (e) => {
          const err = (e.target as IDBRequest).error
          reject(new Error(`put: ${err?.name} ${err?.message}`))
        }
        tx.onabort = () => reject(new Error(`abort: ${tx.error?.name} ${tx.error?.message}`))
      })
      db.close()
    },
    { ean, bytes },
  )
}

/** Relit la photo stockée : taille, type et octets. */
async function readPhoto(page: Page, ean: string) {
  return page.evaluate(async (ean) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('forge')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const row = await new Promise<{ bytes: ArrayBuffer; mime: string } | undefined>((resolve, reject) => {
      const req = db.transaction('foodPhotos', 'readonly').objectStore('foodPhotos').get(`off-${ean}`)
      req.onsuccess = () => resolve(req.result as { bytes: ArrayBuffer; mime: string } | undefined)
      req.onerror = () => reject(req.error)
    })
    db.close()
    if (!row) return null
    return {
      mime: row.mime,
      size: row.bytes.byteLength,
      bytes: Array.from(new Uint8Array(row.bytes)),
    }
  }, ean)
}

async function exportFile(page: Page): Promise<{ name: string; content: string }> {
  await page.getByRole('button', { name: 'Préparer la sauvegarde' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Télécharger le fichier' }).click()
  const download = await downloadPromise
  await expect(page.getByText(/Fichier proposé au téléchargement/)).toBeVisible()
  await page.getByRole('button', { name: 'C’est enregistré' }).click()
  const { readFile } = await import('node:fs/promises')
  return { name: download.suggestedFilename(), content: await readFile(await download.path(), 'utf8') }
}

test('sauvegarde avec photo de produit : export (schéma 3, base64) puis import Remplacer restitue les octets', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await forceDownloadPath(page)
  await page.goto('./')
  await completeOnboarding(page)
  await seedPhoto(page, EAN, JPEG_BYTES)
  expect(await readPhoto(page, EAN)).toMatchObject({ size: JPEG_BYTES.length, mime: 'image/jpeg' })

  await openSettings(page)
  const exported = await exportFile(page)
  // Un PrematureCommitError ferait échouer l'export : message d'erreur à l'écran, pas de téléchargement.
  await expect(page.getByText('Sauvegarde exportée.')).toBeVisible()

  const parsed = JSON.parse(exported.content) as {
    schemaVersion: number
    photos?: { foodId: string; mime: string; base64: string }[]
  }
  expect(parsed.schemaVersion).toBe(3)
  expect(parsed.photos).toHaveLength(1)
  const photo = parsed.photos?.[0]
  if (!photo) throw new Error('photos[0] absent')
  expect(photo.foodId).toBe(`off-${EAN}`)
  expect(photo.mime).toBe('image/jpeg')
  expect(Buffer.from(photo.base64, 'base64')).toEqual(Buffer.from(JPEG_BYTES))

  // Import Remplacer : on supprime d'abord la photo localement pour prouver qu'elle revient du fichier.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('forge')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('foodPhotos', 'readwrite')
      tx.objectStore('foodPhotos').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
  expect(await readPhoto(page, EAN)).toBeNull()

  await page.getByLabel('Choisir un fichier').setInputFiles({
    name: exported.name,
    mimeType: 'application/json',
    buffer: Buffer.from(exported.content),
  })
  await page.getByRole('button', { name: 'Remplacer toutes mes données' }).click()
  await page
    .getByRole('dialog', { name: 'Tout remplacer ?' })
    .getByRole('button', { name: 'Oui, tout remplacer' })
    .click()
  await expect(page.getByText(/Sauvegarde importée \(données remplacées\)/)).toBeVisible()

  const restored = await readPhoto(page, EAN)
  expect(restored).toMatchObject({ size: JPEG_BYTES.length, mime: 'image/jpeg', bytes: JPEG_BYTES })

  expect(errors).toEqual([])
})
