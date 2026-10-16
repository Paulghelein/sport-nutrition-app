import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'
import type { FoodPhoto } from '../../types'
import { usePhotoUrls } from './usePhotoUrls'

const T1 = '2026-10-16T08:00:00.000Z'
const T2 = '2026-10-16T09:00:00.000Z'
const bytes = (n: number) => new Uint8Array([n, 1, 2, 3]).buffer
const photo = (foodId: string, fetchedAt = T1, mime: FoodPhoto['mime'] = 'image/png'): FoodPhoto => ({
  foodId,
  mime,
  bytes: bytes(1),
  fetchedAt,
})

let seq = 0
const blobs: Blob[] = []
let create: ReturnType<typeof vi.spyOn>
let revoke: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  seq = 0
  blobs.length = 0
  // jsdom n'a pas ces fonctions : on les pose pour pouvoir les espionner, puis restoreAllMocks nettoie.
  URL.createObjectURL ??= () => ''
  URL.revokeObjectURL ??= () => undefined
  create = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob as Blob)
    return `blob:test/${++seq}`
  })
  revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Probe({ ids, onUrls }: { ids: string[]; onUrls: (m: ReadonlyMap<string, string>) => void }) {
  onUrls(usePhotoUrls(ids))
  return null
}

describe('usePhotoUrls', () => {
  it('une URL blob par photo (type conservé), rien pour un aliment sans photo', async () => {
    await db.foodPhotos.put(photo('off-1', T1, 'image/jpeg'))
    let last: ReadonlyMap<string, string> = new Map()
    render(<Probe ids={['off-1', 'off-2']} onUrls={(m) => (last = m)} />)
    await waitFor(() => expect(last.get('off-1')).toBe('blob:test/1'))
    expect(last.has('off-2')).toBe(false)
    expect(blobs[0]?.type).toBe('image/jpeg')
    expect(blobs[0]?.size).toBe(4)
    expect(revoke).not.toHaveBeenCalled()
  })

  it('révoque les URL au démontage', async () => {
    await db.foodPhotos.put(photo('off-1'))
    let last: ReadonlyMap<string, string> = new Map()
    const { unmount } = render(<Probe ids={['off-1']} onUrls={(m) => (last = m)} />)
    await waitFor(() => expect(last.size).toBe(1))
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:test/1')
  })

  it('photo remplacée : nouvelle URL, ancienne révoquée après coup', async () => {
    await db.foodPhotos.put(photo('off-1'))
    let last: ReadonlyMap<string, string> = new Map()
    render(<Probe ids={['off-1']} onUrls={(m) => (last = m)} />)
    await waitFor(() => expect(last.get('off-1')).toBe('blob:test/1'))
    await act(async () => {
      await db.foodPhotos.put(photo('off-1', T2, 'image/webp'))
    })
    await waitFor(() => expect(last.get('off-1')).toBe('blob:test/2'))
    expect(blobs[1]?.type).toBe('image/webp')
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:test/1'))
  })

  it('une liste qui change ne recrée pas les URL inchangées ; une photo retirée est révoquée', async () => {
    await db.foodPhotos.bulkPut([photo('off-1'), photo('off-2')])
    let last: ReadonlyMap<string, string> = new Map()
    const { rerender } = render(<Probe ids={['off-1']} onUrls={(m) => (last = m)} />)
    await waitFor(() => expect(last.get('off-1')).toBe('blob:test/1'))
    rerender(<Probe ids={['off-1', 'off-2']} onUrls={(m) => (last = m)} />)
    await waitFor(() => expect(last.get('off-2')).toBe('blob:test/2'))
    expect(last.get('off-1')).toBe('blob:test/1')
    expect(create).toHaveBeenCalledTimes(2)
    rerender(<Probe ids={['off-2']} onUrls={(m) => (last = m)} />)
    await waitFor(() => expect(last.has('off-1')).toBe(false))
    expect(last.get('off-2')).toBe('blob:test/2')
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:test/1'))
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('aucun identifiant : aucune URL créée ni révoquée', async () => {
    await db.foodPhotos.put(photo('off-1'))
    let last: ReadonlyMap<string, string> = new Map([['x', 'y']])
    render(<Probe ids={[]} onUrls={(m) => (last = m)} />)
    await waitFor(() => expect(last.size).toBe(0))
    expect(create).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
  })
})
