import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { AppDB } from './database'
import { makeFullTables, makeProfile } from './testFixtures'

describe('migration Dexie v1 → v2', () => {
  it('conserve les données existantes et crée la table ciqual', async () => {
    const name = 'forge-migration-test'
    await Dexie.delete(name)
    const old = new Dexie(name)
    old.version(1).stores({
      profile: 'id',
      weighIns: 'id, &date',
      measurements: 'id, date',
      equipment: 'id',
      exercises: 'id, source',
      exercisePrefs: 'exerciseId',
      exerciseState: 'exerciseId',
      sessions: 'id, date, status',
      sessionTemplates: 'id',
      foods: 'id, source, ciqualCode, ean, favorite, lastUsedAt',
      recipes: 'id, source',
      fridge: 'id, recipeId',
      foodLog: 'id, date, [date+slot]',
      shoppingLists: 'id',
      settings: 'id',
    })
    const tables = makeFullTables()
    await old.table('profile').put(makeProfile())
    await old.table('sessions').bulkPut(tables.sessions)
    await old.table('foodLog').bulkPut(tables.foodLog)
    await old.table('weighIns').bulkPut(tables.weighIns)
    const seedRow = (id: string, extra: Record<string, unknown> = {}, source = 'seed') => ({
      ...tables.exercises[0],
      id,
      source,
      ...extra,
    })
    await old
      .table('exercises')
      .bulkPut([
        seedRow('turkish-get-up'),
        seedRow('two-hand-swing'),
        seedRow('farmer-carry', { finisher: false }),
        seedRow('rack-carry', {}, 'user'),
        seedRow('goblet-squat'),
      ])
    old.close()

    const upgraded = new AppDB(name)
    await upgraded.open()
    expect(upgraded.verno).toBe(2)
    expect(upgraded.tables.map((t) => t.name)).toContain('ciqual')
    expect(await upgraded.ciqual.count()).toBe(0)
    expect(await upgraded.profile.get('me')).toEqual(makeProfile())
    expect(await upgraded.sessions.toArray()).toEqual(tables.sessions)
    expect(await upgraded.foodLog.where('date').equals('2026-02-28').count()).toBe(2)
    expect((await upgraded.weighIns.toArray()).length).toBe(2)
    const ex = Object.fromEntries((await upgraded.exercises.toArray()).map((e) => [e.id, e]))
    expect(ex['turkish-get-up']?.learnUnloaded).toBe(true)
    expect(ex['two-hand-swing']?.finisher).toBe(true)
    expect(ex['farmer-carry']?.finisher).toBe(false)
    expect(ex['rack-carry']?.finisher).toBeUndefined()
    expect(ex['goblet-squat']?.finisher).toBeUndefined()
    upgraded.close()
    await Dexie.delete(name)
  })
})
