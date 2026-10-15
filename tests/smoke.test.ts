import { describe, expect, it } from 'vitest'

describe('smoke', () => {
  it('exécute un test trivial', () => {
    expect(1 + 1).toBe(2)
  })

  it('dispose de indexedDB (fake-indexeddb) et ouvre une base', async () => {
    expect(typeof indexedDB).toBe('object')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('smoke-db', 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore('items')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    expect(db.name).toBe('smoke-db')
    expect(db.objectStoreNames.contains('items')).toBe(true)
    db.close()
  })
})
