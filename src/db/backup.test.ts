import { beforeEach, describe, expect, it } from 'vitest'
import type { BackupFile, TableName } from '../types'
import { TABLE_NAMES } from '../types'
import {
  backupFileName,
  exportBackup,
  importBackup,
  markExported,
  migrateBackup,
  parseBackup,
} from './backup'
import { DB_SCHEMA_VERSION, db } from './database'
import { getSettings, listWeighIns } from './repositories'
import { NOW, makeFullTables } from './testFixtures'

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
}
async function load(tables: BackupFile['tables']) {
  for (const name of TABLE_NAMES) await db.table(name).bulkPut(tables[name])
}
async function dump(): Promise<BackupFile['tables']> {
  return (await exportBackup(NOW)).tables
}
function sortedTables(t: BackupFile['tables']) {
  return Object.fromEntries(
    TABLE_NAMES.map((n) => [n, [...t[n]].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]),
  )
}
function cell(rows: Record<string, unknown>[] | undefined, i: number): Record<string, unknown> {
  const row = rows?.[i]
  if (!row) throw new Error('ligne absente')
  return row
}
function first<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error('ligne absente')
  return row
}
function mustParse(text: string) {
  const r = parseBackup(text)
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r
}

beforeEach(clearAll)

describe('backupFileName', () => {
  it('utilise la date du jour d’export', () => {
    expect(backupFileName('2026-03-01T12:00:00')).toBe('forge-sauvegarde-2026-03-01.json')
    // instant UTC converti en jour local
    const d = new Date(2026, 2, 5, 23, 30)
    expect(backupFileName(d.toISOString())).toBe('forge-sauvegarde-2026-03-05.json')
  })
})

describe('exportBackup', () => {
  it('contient toutes les tables, vides incluses, sans toucher lastExportAt', async () => {
    const b = await exportBackup(NOW)
    expect(b.app).toBe('forge')
    expect(b.schemaVersion).toBe(DB_SCHEMA_VERSION)
    expect(b.exportedAt).toBe(NOW)
    expect(Object.keys(b.tables).sort()).toEqual([...TABLE_NAMES].sort())
    for (const n of TABLE_NAMES) expect(b.tables[n]).toEqual([])
    expect(await db.settings.count()).toBe(0)
  })

  it('markExported met à jour lastExportAt', async () => {
    await markExported('2026-03-05T10:00:00.000Z')
    expect((await getSettings()).lastExportAt).toBe('2026-03-05T10:00:00.000Z')
  })
})

describe('aller-retour', () => {
  it('export -> JSON -> parse -> import(replace) restitue des données identiques', async () => {
    const tables = makeFullTables()
    await load(tables)
    for (const n of TABLE_NAMES) expect(tables[n].length).toBeGreaterThan(0)
    const before = await dump()
    const text = JSON.stringify(await exportBackup(NOW))
    await clearAll()
    const parsed = mustParse(text)
    expect(parsed.summary.foodLog).toBe(2)
    const report = await importBackup(parsed.backup, 'replace')
    expect(report.mode).toBe('replace')
    expect(report.counts.weighIns).toBe(2)
    expect(await dump()).toEqual(before)
    expect(before).toEqual(sortedTables(tables) && before) // sanity
    expect(sortedTables(await dump())).toEqual(sortedTables(tables))
  })
})

describe('parseBackup', () => {
  const valid = () => ({ app: 'forge', schemaVersion: 1, exportedAt: NOW, tables: makeFullTables() })

  it('refuse un JSON invalide', () => {
    const r = parseBackup('{pas du json')
    expect(r).toEqual({ ok: false, errors: ['Le fichier n’est pas un JSON valide.'] })
  })

  it('refuse un mauvais app ou un non-objet', () => {
    for (const v of [{ ...valid(), app: 'autre' }, [], null, 3]) {
      expect(parseBackup(JSON.stringify(v)).ok).toBe(false)
    }
  })

  it('refuse une version future', () => {
    const r = parseBackup(JSON.stringify({ ...valid(), schemaVersion: DB_SCHEMA_VERSION + 1 }))
    expect(r).toEqual({
      ok: false,
      errors: ['Cette sauvegarde a été créée par une version plus récente de l’app.'],
    })
  })

  it('refuse une version ou une date d’export invalide', () => {
    expect(parseBackup(JSON.stringify({ ...valid(), schemaVersion: 0 })).ok).toBe(false)
    expect(parseBackup(JSON.stringify({ ...valid(), schemaVersion: '1' })).ok).toBe(false)
    expect(parseBackup(JSON.stringify({ ...valid(), exportedAt: 'hier' })).ok).toBe(false)
  })

  it('traite une table absente comme vide', () => {
    const r = mustParse(JSON.stringify({ app: 'forge', schemaVersion: 1, exportedAt: NOW, tables: {} }))
    for (const n of TABLE_NAMES) expect(r.backup.tables[n]).toEqual([])
    const r2 = mustParse(JSON.stringify({ app: 'forge', schemaVersion: 1, exportedAt: NOW }))
    expect(r2.summary.weighIns).toBe(0)
  })

  it('signale table, ligne et champ des lignes invalides', () => {
    const v = valid()
    const tables = v.tables as unknown as Record<string, Record<string, unknown>[]>
    cell(tables.weighIns, 1)['date'] = '2026-13-01'
    cell(tables.weighIns, 0)['weightKg'] = 'lourd'
    cell(tables.profile, 0)['sex'] = 'x'
    cell(tables.foodLog, 0)['extra'] = 1
    const r = parseBackup(JSON.stringify(v))
    expect(r.ok).toBe(false)
    if (r.ok) return
    const all = r.errors.join('\n')
    expect(all).toContain('Table « weighIns », ligne 2 : champ « date »')
    expect(all).toContain('Table « weighIns », ligne 1 : champ « weightKg » type invalide')
    expect(all).toContain('Table « profile », ligne 1 : champ « sex » valeur non autorisée')
    expect(all).toContain('champ(s) inconnu(s) « extra »')
  })

  it('limite à 10 erreurs', () => {
    const v = valid()
    v.tables.weighIns = Array.from({ length: 30 }, (_, i) => ({
      id: `w${i}`,
      date: 'x',
      weightKg: 70,
      createdAt: NOW,
    }))
    const r = parseBackup(JSON.stringify(v))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toHaveLength(10)
  })

  it('refuse les doublons d’id et de date de pesée', () => {
    const v = valid()
    v.tables.weighIns.push({ id: 'w1', date: '2026-01-01', weightKg: 70, createdAt: NOW })
    expect(parseBackup(JSON.stringify(v)).ok).toBe(false)
    const v2 = valid()
    v2.tables.weighIns.push({ id: 'w9', date: '2026-02-27', weightKg: 70, createdAt: NOW })
    const r = parseBackup(JSON.stringify(v2))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('même date')
  })

  it('rejette valeurs hors énumération et nombres non finis (null)', () => {
    const v = valid()
    const t = v.tables as unknown as Record<string, Record<string, unknown>[]>
    cell(t.settings, 0)['coachUrl'] = 5
    cell(t.sessions, 0)['durationMin'] = 50
    cell(t.measurements, 0)['armCm'] = null
    const r = parseBackup(JSON.stringify(v))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3)
  })

  it('migrateBackup est l’identité en version 1', () => {
    const raw = { app: 'forge', schemaVersion: 1, exportedAt: NOW, tables: {} }
    expect(migrateBackup(raw)).toBe(raw)
  })
})

describe('importBackup', () => {
  it('replace vide les tables avant d’écrire', async () => {
    await load(makeFullTables())
    const tables = makeFullTables()
    tables.weighIns = [{ id: 'nouveau', date: '2026-04-01', weightKg: 75, createdAt: NOW }]
    tables.foodLog = []
    const file: BackupFile = { app: 'forge', schemaVersion: 1, exportedAt: NOW, tables }
    const report = await importBackup(file, 'replace')
    expect(report.counts.weighIns).toBe(1)
    expect(report.counts.foodLog).toBe(0)
    expect((await listWeighIns()).map((w) => w.id)).toEqual(['nouveau'])
    expect(await db.foodLog.count()).toBe(0)
  })

  it('merge : la ligne du fichier gagne, les autres sont conservées', async () => {
    await load(makeFullTables())
    const tables = makeFullTables()
    for (const n of TABLE_NAMES) tables[n] = [] as never
    tables.foodLog = [
      {
        id: 'l1',
        date: '2026-02-28',
        slot: 'dinner',
        name: 'Modifié',
        origin: { kind: 'free' },
        macros: { kcal: 1, protein: 1, carbs: 1, fat: 1 },
        createdAt: NOW,
      },
      {
        id: 'l3',
        date: '2026-03-01',
        slot: 'snack',
        name: 'Nouveau',
        origin: { kind: 'import', estimated: true },
        macros: { kcal: 2, protein: 2, carbs: 2, fat: 2 },
        createdAt: NOW,
      },
    ]
    const report = await importBackup({ app: 'forge', schemaVersion: 1, exportedAt: NOW, tables }, 'merge')
    expect(report.counts.foodLog).toBe(2)
    const log = (await db.foodLog.toArray()).sort((a, b) => a.id.localeCompare(b.id))
    expect(log.map((l) => [l.id, l.name])).toEqual([
      ['l1', 'Modifié'],
      ['l2', 'Riz'],
      ['l3', 'Nouveau'],
    ])
    expect(await db.profile.count()).toBe(1)
    expect(await db.weighIns.count()).toBe(2)
  })

  it('merge : une pesée importée à une date existante sous un autre id remplace l’existante', async () => {
    await load(makeFullTables())
    const tables = makeFullTables()
    for (const n of TABLE_NAMES) tables[n] = [] as never
    tables.weighIns = [{ id: 'autre-id', date: '2026-02-27', weightKg: 99, createdAt: NOW }]
    await importBackup({ app: 'forge', schemaVersion: 1, exportedAt: NOW, tables }, 'merge')
    const list = await listWeighIns()
    expect(list.map((w) => [w.id, w.date, w.weightKg])).toEqual([
      ['autre-id', '2026-02-27', 99],
      ['w2', '2026-02-28', 70.8],
    ])
  })

  it('merge : échange de dates entre deux pesées sans violation de contrainte', async () => {
    await load(makeFullTables())
    const tables = makeFullTables()
    for (const n of TABLE_NAMES) tables[n] = [] as never
    tables.weighIns = [
      { id: 'w1', date: '2026-02-28', weightKg: 1 + 69, createdAt: NOW },
      { id: 'w2', date: '2026-02-27', weightKg: 71, createdAt: NOW },
    ]
    await importBackup({ app: 'forge', schemaVersion: 1, exportedAt: NOW, tables }, 'merge')
    expect((await listWeighIns()).map((w) => [w.id, w.date])).toEqual([
      ['w2', '2026-02-27'],
      ['w1', '2026-02-28'],
    ])
  })

  it('est atomique : une écriture qui échoue annule tout', async () => {
    await load(makeFullTables())
    const before = await dump()
    const tables = makeFullTables()
    // Deux pesées à la même date, ids différents : viole l'index unique en cours d'écriture.
    tables.weighIns = [
      { id: 'a', date: '2026-05-01', weightKg: 70, createdAt: NOW },
      { id: 'b', date: '2026-05-01', weightKg: 71, createdAt: NOW },
    ]
    const bad: BackupFile = { app: 'forge', schemaVersion: 1, exportedAt: NOW, tables }
    await expect(importBackup(bad, 'replace')).rejects.toThrow()
    expect(await dump()).toEqual(before)
  })

  it('compte les lignes écrites pour chaque table', async () => {
    const report = await importBackup(
      { app: 'forge', schemaVersion: 1, exportedAt: NOW, tables: makeFullTables() },
      'merge',
    )
    const expected = Object.fromEntries(TABLE_NAMES.map((n: TableName) => [n, makeFullTables()[n].length]))
    expect(report.counts).toEqual(expected)
  })
})

describe('règles métier à l’import', () => {
  const file = () => ({ app: 'forge', schemaVersion: 1, exportedAt: NOW, tables: makeFullTables() })
  const errorsOf = (v: unknown, today = '2026-03-01') => {
    const r = parseBackup(JSON.stringify(v), today)
    if (r.ok) throw new Error('devrait être refusé')
    return r.errors.join('\n')
  }

  it('accepte le fichier de référence', () => {
    expect(parseBackup(JSON.stringify(file()), '2026-03-01').ok).toBe(true)
  })
  it('refuse stepKg 0, min > max, pas non multiple', () => {
    const a = file()
    first(a.tables.equipment).kettlebell.stepKg = 0
    expect(errorsOf(a)).toContain('Table « equipment », ligne 1 : Le pas de la kettlebell')
    const b = file()
    first(b.tables.equipment).kettlebell.minKg = 30
    expect(errorsOf(b)).toContain('minimum')
    const c = file()
    first(c.tables.equipment).kettlebell.stepKg = 5
    expect(errorsOf(c)).toContain('multiple')
  })
  it('refuse poids négatif, pesée future, taille 0, âge 10 ans', () => {
    const a = file()
    first(a.tables.weighIns).weightKg = -5
    expect(errorsOf(a)).toContain('30 et 250')
    const b = file()
    first(b.tables.weighIns).date = '2026-03-03'
    expect(errorsOf(b)).toContain('futur')
    const c = file()
    first(c.tables.profile).heightCm = 0
    expect(errorsOf(c)).toContain('taille')
    const d = file()
    first(d.tables.profile).birthDate = '2016-01-01'
    expect(errorsOf(d)).toContain('Table « profile », ligne 1 : L’âge')
  })
  it('refuse mensuration vide et coachUrl javascript:', () => {
    const a = file()
    a.tables.measurements[0] = { id: 'm1', date: '2026-02-28', createdAt: NOW }
    expect(errorsOf(a)).toContain('au moins une')
    const b = file()
    first(b.tables.settings).coachUrl = 'javascript:alert(1)'
    expect(errorsOf(b)).toContain('https')
  })
  it('refuse une table inconnue', () => {
    const a = { ...file(), tables: { ...makeFullTables(), bidule: [] } }
    expect(errorsOf(a)).toContain('Table « bidule » inconnue')
  })
})

describe('onboardingCompleted à l’import (profil présent en base)', () => {
  const emptyTables = () => {
    const t = makeFullTables()
    for (const n of TABLE_NAMES) t[n] = [] as never
    return t
  }
  const wrap = (tables: BackupFile['tables']): BackupFile => ({
    app: 'forge',
    schemaVersion: 1,
    exportedAt: NOW,
    tables,
  })
  const settingsRow = (done: boolean) => ({ ...first(makeFullTables().settings), onboardingCompleted: done })

  it('merge : base non terminée sans profil + fichier avec profil -> true', async () => {
    await db.settings.put(settingsRow(false))
    const t = emptyTables()
    t.profile = makeFullTables().profile
    await importBackup(wrap(t), 'merge')
    expect((await getSettings()).onboardingCompleted).toBe(true)
  })

  it('merge : fichier avec profil et settings false -> true', async () => {
    const t = emptyTables()
    t.profile = makeFullTables().profile
    t.settings = [settingsRow(false)]
    await importBackup(wrap(t), 'merge')
    expect((await getSettings()).onboardingCompleted).toBe(true)
  })

  it('merge : sans profil nulle part -> false même si le fichier dit true', async () => {
    const t = emptyTables()
    t.settings = [settingsRow(true)]
    await importBackup(wrap(t), 'merge')
    expect((await getSettings()).onboardingCompleted).toBe(false)
  })

  it('replace avec profil mais sans settings : réglages par défaut terminés', async () => {
    const t = emptyTables()
    t.profile = makeFullTables().profile
    const report = await importBackup(wrap(t), 'replace', NOW)
    const s = await getSettings()
    expect(s.onboardingCompleted).toBe(true)
    expect(s.updatedAt).toBe(NOW)
    expect(report.counts.settings).toBe(1)
  })

  it('replace avec profil et settings false -> true', async () => {
    const t = emptyTables()
    t.profile = makeFullTables().profile
    t.settings = [settingsRow(false)]
    await importBackup(wrap(t), 'replace')
    expect((await getSettings()).onboardingCompleted).toBe(true)
  })

  it('replace sans profil : settings true dans le fichier -> false', async () => {
    await load(makeFullTables())
    const t = emptyTables()
    t.settings = [settingsRow(true)]
    await importBackup(wrap(t), 'replace')
    expect((await getSettings()).onboardingCompleted).toBe(false)
    await clearAll()
    await importBackup(wrap(emptyTables()), 'replace')
    expect(await db.settings.count()).toBe(0)
  })
})

describe('tolérance de fuseau à l’import', () => {
  it('accepte une pesée à today + 1 jour, refuse today + 2', () => {
    const mk = (date: string) => {
      const v = { app: 'forge', schemaVersion: 1, exportedAt: NOW, tables: makeFullTables() }
      first(v.tables.weighIns).date = date
      return parseBackup(JSON.stringify(v), '2026-03-01')
    }
    expect(mk('2026-03-02').ok).toBe(true)
    expect(mk('2026-03-03').ok).toBe(false)
  })
})

/* eslint-disable @typescript-eslint/no-non-null-assertion -- indices de fixtures de test connus */
describe('sauvegarde v2 (Ciqual, bornes J4/J5)', () => {
  const ciqualRow = {
    id: 'ciqual-1',
    code: '1',
    name: 'Riz',
    group: 'g',
    search: 'riz',
    per100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 },
  }
  const wrapV = (schemaVersion: number, tables = makeFullTables()) => ({
    app: 'forge',
    schemaVersion,
    exportedAt: NOW,
    tables,
  })
  const errorsOf = (v: unknown) => {
    const r = parseBackup(JSON.stringify(v), '2026-03-01')
    if (r.ok) throw new Error('devrait être refusé')
    return r.errors.join('\n')
  }

  it('exporte en schemaVersion 2 sans la table ciqual', async () => {
    await db.ciqual.put(ciqualRow)
    const b = await exportBackup(NOW)
    expect(b.schemaVersion).toBe(2)
    expect(Object.keys(b.tables)).not.toContain('ciqual')
    expect(JSON.stringify(b)).not.toContain('ciqual-1"')
  })

  it('importe une sauvegarde v1 et v2, refuse la v3', () => {
    expect(parseBackup(JSON.stringify(wrapV(1)), '2026-03-01').ok).toBe(true)
    expect(parseBackup(JSON.stringify(wrapV(2)), '2026-03-01').ok).toBe(true)
    expect(errorsOf(wrapV(3))).toMatch(/plus récente/)
  })

  it('migrateBackup v1 → v2 est l’identité', () => {
    const raw = { app: 'forge', schemaVersion: 1, exportedAt: NOW, tables: {} }
    expect(migrateBackup(raw)).toEqual(raw)
  })

  it('replace ne vide pas la table ciqual et garde la ciqualVersion locale', async () => {
    await db.ciqual.put(ciqualRow)
    await db.settings.put({ ...makeFullTables().settings[0]!, ciqualVersion: 'local-r1' })
    const t = makeFullTables()
    t.settings = [{ ...t.settings[0]!, ciqualVersion: 'fichier-r9' }]
    const r = mustParse(JSON.stringify(wrapV(2, t)))
    await importBackup(r.backup, 'replace')
    expect(await db.ciqual.count()).toBe(1)
    expect((await getSettings()).ciqualVersion).toBe('local-r1')
  })

  it('téléphone neuf : la ciqualVersion du fichier n’est pas reprise (replace et merge)', async () => {
    const t = makeFullTables()
    t.settings = [{ ...t.settings[0]!, ciqualVersion: 'fichier-r9' }]
    const r = mustParse(JSON.stringify(wrapV(2, t)))
    await importBackup(r.backup, 'replace')
    expect((await getSettings()).ciqualVersion).toBeUndefined()
    await importBackup(r.backup, 'merge')
    expect((await getSettings()).ciqualVersion).toBeUndefined()
  })

  it('refuse un profil aux objectifs nutritionnels hors bornes', () => {
    for (const patch of [{ surplus: 2 }, { kcalAdjustment: 50000 }, { proteinPerKg: 5 }, { fatShare: 0.9 }]) {
      const t = makeFullTables()
      t.profile = [{ ...t.profile[0]!, nutrition: { ...t.profile[0]!.nutrition, ...patch } }]
      expect(errorsOf(wrapV(2, t))).toMatch(/profile/)
    }
  })

  it('refuse les aliments hors bornes', () => {
    const mk = (patch: Record<string, unknown>) => {
      const t = makeFullTables()
      t.foods = [{ ...t.foods[0]!, per100g: { ...t.foods[0]!.per100g, ...patch } }]
      return errorsOf(wrapV(2, t))
    }
    expect(mk({ kcal: 901 })).toMatch(/foods/)
    expect(mk({ protein: -1 })).toMatch(/foods/)
    expect(mk({ fat: 101 })).toMatch(/foods/)
    const t = makeFullTables()
    t.foods = [{ ...t.foods[0]!, name: '  ' }]
    expect(errorsOf(wrapV(2, t))).toMatch(/nom/)
  })

  it('refuse les entrées de journal incohérentes', () => {
    const t = makeFullTables()
    t.foodLog = [{ ...t.foodLog[1]!, origin: { kind: 'food', foodId: 'x', grams: 0 } }]
    expect(errorsOf(wrapV(2, t))).toMatch(/quantité/)
    const t2 = makeFullTables()
    t2.foodLog = [{ ...t2.foodLog[1]!, name: '' }]
    expect(errorsOf(wrapV(2, t2))).toMatch(/nom/)
    const t3 = makeFullTables()
    t3.foodLog = [{ ...t3.foodLog[1]!, macros: { kcal: -5, protein: 0, carbs: 0, fat: 0 } }]
    expect(errorsOf(wrapV(2, t3))).toMatch(/macros/)
  })

  it('refuse les séances avec répétitions ou durées négatives', () => {
    const t = makeFullTables()
    t.sessions[0]!.blocks[0]!.exercises[0]!.sets[0]!.actualReps = -2
    expect(errorsOf(wrapV(2, t))).toMatch(/sessions/)
  })

  it('accepte les nouveaux champs de séance', () => {
    const t = makeFullTables()
    t.sessions[0]!.restEndsAt = NOW
    t.sessions[0]!.progressionAppliedAt = NOW
    t.sessions[0]!.suggestions = [
      { kind: 'tempo', exerciseId: 'goblet-squat', message: 'm', status: 'pending' },
    ]
    t.sessions[0]!.blocks[0]!.exercises[0]!.replacedFrom = 'x'
    expect(parseBackup(JSON.stringify(wrapV(2, t)), '2026-03-01').ok).toBe(true)
  })
})
